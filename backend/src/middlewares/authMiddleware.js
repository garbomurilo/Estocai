const { admin, db } = require('../config/firebase');

function extrairToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split('Bearer ')[1].trim();
    }
    if (req.body && (req.body.idToken || req.body.token)) {
        return String(req.body.idToken || req.body.token).trim();
    }
    return null;
}

/**
 * Normaliza as nomenclaturas de perfil/cargo para validação RBAC consistente:
 * - 'adm' / 'ADMIN' -> 'ADMIN'
 * - 'repositor' / 'ESTOQUISTA' -> 'ESTOQUISTA'
 * - 'caixa' / 'CAIXA' -> 'CAIXA'
 */
function normalizarCargo(cargo) {
    const valor = String(cargo || '').trim().toUpperCase();
    if (valor === 'ADMIN' || valor === 'ADM' || valor === 'ADMINISTRADOR') return 'ADMIN';
    if (valor === 'ESTOQUISTA' || valor === 'REPOSITOR') return 'ESTOQUISTA';
    if (valor === 'CAIXA') return 'CAIXA';
    return '';
}

/**
 * PASSO 1: Middleware de Segurança e Roteamento Tenant
 * 1. Valida o token (admin.auth().verifyIdToken()).
 * 2. Lê /usuarios/{uid} para descobrir o tenantId.
 * 3. Injeta req.tenantId na requisição.
 */
async function authMiddleware(req, res, next) {
    const token = extrairToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Token JWT ausente ou mal formatado.' });
    }

    let decodedToken;
    try {
        // 1. Valida o token JWT (Firebase Auth)
        decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
        console.error('[authMiddleware] Erro na validação JWT:', error.message);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    try {
        req.uid = decodedToken.uid;
        req.userEmail = decodedToken.email || '';

        // 2. Lê /usuarios/{uid} para descobrir o tenantId
        const userRef = db.collection('usuarios').doc(decodedToken.uid);
        let userSnap = await userRef.get();

        // Caso a conta já exista no Firebase Auth mas ainda não tenha documento em /usuarios/{uid}, inicializa com status 'pendente'
        if (!userSnap.exists) {
            const novoAdmin = {
                nome: decodedToken.name || (decodedToken.email ? decodedToken.email.split('@')[0] : 'Administrador'),
                email: (decodedToken.email || '').toLowerCase(),
                cargo: 'ADMIN',
                ativo: true,
                status: 'pendente',
                aprovado: false,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                tenantId: decodedToken.uid
            };
            await userRef.set(novoAdmin);

            const tenantRef = db.collection('tenants').doc(decodedToken.uid);
            const tenantSnap = await tenantRef.get();
            if (!tenantSnap.exists) {
                await tenantRef.set({
                    nomeFantasia: 'Estocaí Comércio',
                    ativo: true,
                    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                    config_fidelidade: {
                        meta_compras_premio: parseInt(10, 10),
                        valor_minimo_ponto: parseFloat(0.0),
                        descricao_premio: 'Prêmio Fidelidade',
                        ativo: true
                    }
                });
            }
            userSnap = await userRef.get();
        }

        const userData = userSnap.data();

        // Bloqueio de Acesso para Contas Pendentes de Aprovação (Admin Approval Workflow)
        if (userData.status === 'pendente' || userData.aprovado === false) {
            return res.status(403).json({
                error: 'Conta criada com sucesso, mas pendente de aprovação pelos administradores do sistema.',
                status: 'pendente'
            });
        }

        if (userData.ativo === false) {
            return res.status(403).json({ error: 'Acesso negado. Esta conta foi desativada pelo administrador.' });
        }

        if (!userData.tenantId) {
            return res.status(403).json({ error: 'Usuário sem tenantId vinculado.' });
        }

        const cargoNormalizado = normalizarCargo(userData.cargo);
        if (!cargoNormalizado) {
            return res.status(403).json({ error: 'Acesso negado. Perfil de usuário inválido.' });
        }

        // 3. Injeta req.tenantId na requisição
        req.tenantId = String(userData.tenantId);
        req.usuario = {
            uid: decodedToken.uid,
            nome: userData.nome,
            email: userData.email,
            cargo: cargoNormalizado,
            ativo: userData.ativo,
            status: userData.status || 'aprovado',
            aprovado: userData.aprovado !== false,
            tenantId: String(userData.tenantId)
        };

        next();
    } catch (error) {
        console.error('[authMiddleware] Erro ao carregar perfil/tenant do usuário:', error);
        return res.status(500).json({ error: 'Erro interno ao validar sessão do usuário.' });
    }
}

/**
 * Middleware RBAC no Backend: verificarRole(rolesPermitidas)
 * Intercepta o idToken no Header (via authMiddleware se ainda não validado),
 * consulta a role do usuário no Firestore e aplica o controle de acesso (Deny-by-Default):
 * - Bloqueia 'repositor' (ESTOQUISTA) para /api/clientes, /api/fidelidade, /api/expediente, /api/pedidos (Erro 403)
 * - Bloqueia 'caixa' (CAIXA) para POST/PUT/DELETE em /api/produtos (Erro 403)
 * - Garante acesso total ao 'adm' (ADMIN)
 */
function verificarRole(...rolesInput) {
    const listaPlana = rolesInput.flat();
    const permitidosNormalizados = listaPlana.map(normalizarCargo).filter(Boolean);

    return async (req, res, next) => {
        const validarPermissao = () => {
            const cargoUsuario = normalizarCargo(req.usuario?.cargo);
            // O perfil 'adm' (ADMIN) possui acesso irrestrito
            if (cargoUsuario === 'ADMIN') {
                return next();
            }
            if (!cargoUsuario || !permitidosNormalizados.includes(cargoUsuario)) {
                return res.status(403).json({
                    error: 'Acesso negado: seu perfil não possui permissão para realizar esta operação.'
                });
            }
            return next();
        };

        if (!req.usuario) {
            return authMiddleware(req, res, validarPermissao);
        }
        return validarPermissao();
    };
}

// Alias de compatibilidade
const requireRole = verificarRole;

/**
 * Middleware auxiliar apenas para validar o JWT no momento de criação de conta (/api/auth/register)
 */
async function verifyTokenOnly(req, res, next) {
    const token = extrairToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Token JWT ausente.' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.uid = decodedToken.uid;
        req.userEmail = decodedToken.email || '';
        next();
    } catch (error) {
        console.error('[verifyTokenOnly] Erro na validação JWT:', error.message);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

module.exports = { authMiddleware, verifyTokenOnly, verificarRole, requireRole, normalizarCargo };
