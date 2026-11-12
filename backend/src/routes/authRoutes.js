const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, verifyTokenOnly, normalizarCargo } = require('../middlewares/authMiddleware');
const {
    enviarEmailAprovacaoUsuario,
    verificarTokenAprovacao
} = require('../services/emailService');

/**
 * POST /api/auth/login
 * Recebe e valida o idToken do Firebase Auth (via Authorization Bearer ou body.idToken),
 * consulta /usuarios/{uid}, bloqueia contas com status 'pendente' (HTTP 403 Forbidden)
 * e retorna a sessão completa do usuário caso aprovado.
 */
router.post('/login', verifyTokenOnly, async (req, res) => {
    try {
        const uid = req.uid;
        const userRef = db.collection('usuarios').doc(uid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(403).json({
                error: 'Conta criada com sucesso, mas pendente de aprovação pelos administradores do sistema.',
                status: 'pendente'
            });
        }

        const userData = userSnap.data();

        // [REGRA DE APROVAÇÃO] Valida o status do usuário no Firestore após verificar o idToken:
        // Se o status for 'pendente' (ou aprovado === false), bloqueia o login com 403 Forbidden.
        if (userData.status === 'pendente' || userData.aprovado === false) {
            return res.status(403).json({
                error: 'Conta criada com sucesso, mas pendente de aprovação pelos administradores do sistema.',
                status: 'pendente'
            });
        }

        if (userData.ativo === false) {
            return res.status(403).json({
                error: 'Acesso negado. Esta conta foi desativada pelo administrador.'
            });
        }

        const tenantId = String(userData.tenantId || uid);
        const tenantRef = db.collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            await tenantRef.set({
                nomeFantasia: 'Estocaí Comércio',
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                limiar_estoque_minimo: 0,
                config_fidelidade: {
                    meta_compras_premio: parseInt(10, 10),
                    valor_minimo_ponto: parseFloat(0.0),
                    descricao_premio: 'Prêmio Fidelidade',
                    ativo: true
                }
            });
        }

        const cargoNormalizado = normalizarCargo(userData.cargo) || 'ADMIN';

        return res.json({
            uid,
            nome: userData.nome,
            email: userData.email,
            cargo: cargoNormalizado,
            ativo: userData.ativo !== false,
            status: userData.status || 'aprovado',
            aprovado: userData.aprovado !== false,
            tenantId
        });
    } catch (error) {
        console.error('[POST /api/auth/login] Erro:', error);
        return res.status(500).json({ error: 'Erro ao autenticar sessão do usuário.' });
    }
});

/**
 * POST /api/auth/register
 * Cria o documento em /tenants/{tenantId} e em /usuarios/{uid} com status: 'pendente'
 * e dispara o e-mail de aprovação via Nodemailer para process.env.ADMIN_EMAIL.
 */
router.post('/register', verifyTokenOnly, async (req, res) => {
    try {
        const uid = req.uid;
        const nome = String(req.body.nome || '').trim();
        const nomeFantasia = String(req.body.nomeFantasia || req.body.empresa || 'Meu Negócio').trim();
        const email = String(req.userEmail || req.body.email || '').trim().toLowerCase();
        const cargo = normalizarCargo(req.body.cargo) || 'ADMIN';

        if (!nome || !email) {
            return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
        }

        const tenantId = String(req.body.tenantId || uid);

        // 1. Grava /tenants/{tenantId} conforme Mapa do Banco de Dados
        const tenantRef = db.collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();
        if (!tenantSnap.exists) {
            const tenantDoc = {
                nomeFantasia: nomeFantasia,
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                limiar_estoque_minimo: 0,
                config_fidelidade: {
                    meta_compras_premio: parseInt(10, 10),
                    valor_minimo_ponto: parseFloat(0.0),
                    descricao_premio: 'Prêmio Fidelidade',
                    ativo: true
                }
            };
            await tenantRef.set(tenantDoc);
        }

        // 2. [STATUS PENDENTE] Inicializa obrigatoriamente o usuário com status: 'pendente' e aprovado: false
        const usuarioDoc = {
            nome: nome,
            email: email,
            cargo: cargo,
            ativo: true,
            status: 'pendente',
            aprovado: false,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            tenantId: tenantId
        };
        await db.collection('usuarios').doc(uid).set(usuarioDoc);

        // 3. [SERVIÇO DE E-MAIL] Dispara e-mail via Nodemailer para os fornecedores (process.env.ADMIN_EMAIL)
        let emailInfo = null;
        try {
            emailInfo = await enviarEmailAprovacaoUsuario({
                uid,
                nome,
                email,
                cargo,
                tenantId,
                nomeFantasia
            });
        } catch (mailError) {
            console.error('[POST /api/auth/register] Aviso ao enviar e-mail de aprovação:', mailError.message);
        }

        return res.status(201).json({
            uid,
            ...usuarioDoc,
            message: 'Cadastro realizado com sucesso! Sua conta passará por uma análise e você será liberado em breve.',
            notificacaoEnviada: Boolean(emailInfo)
        });
    } catch (error) {
        console.error('[POST /api/auth/register] Erro:', error);
        return res.status(500).json({ error: 'Erro ao registrar conta e tenant.' });
    }
});

/**
 * Handler compartilhado para aprovação de conta (GET e POST /api/auth/aprovar-usuario).
 * Protegido por Token JWT exclusivo gerado para o link do e-mail ou credencial de Super-Admin.
 */
async function processarAprovacaoUsuario(req, res) {
    try {
        const authHeader = req.headers.authorization || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const token = String(req.query.token || req.body?.token || bearerToken || '').trim();
        const superAdminKey = String(req.headers['x-super-admin-key'] || req.body?.superAdminKey || '').trim();
        let targetUid = String(req.query.uid || req.body?.uid || '').trim();
        let autorizado = false;

        // Opção 1: Validação via Token JWT exclusivo gerado para o link do e-mail
        if (token) {
            try {
                const payload = verificarTokenAprovacao(token);
                targetUid = payload.uid || targetUid;
                autorizado = true;
            } catch (jwtError) {
                // Caso não seja o token de e-mail, verifica se é um idToken Firebase de Super-Admin
                try {
                    const decodedFirebase = await admin.auth().verifyIdToken(token);
                    const adminEmailConfig = (process.env.ADMIN_EMAIL || 'brasinhagrilldev@gmail.com').trim().toLowerCase();
                    const callerEmail = (decodedFirebase.email || '').trim().toLowerCase();
                    if (
                        decodedFirebase.superAdmin === true ||
                        (adminEmailConfig && callerEmail === adminEmailConfig)
                    ) {
                        autorizado = true;
                    }
                } catch (_) {
                    return res.status(401).json({ error: jwtError.message || 'Token de aprovação inválido ou expirado.' });
                }
            }
        }

        // Opção 2: Validação via chave de Super-Admin (process.env.SUPER_ADMIN_KEY)
        if (!autorizado && process.env.SUPER_ADMIN_KEY && superAdminKey === process.env.SUPER_ADMIN_KEY) {
            autorizado = true;
        }

        if (!autorizado) {
            return res.status(403).json({
                error: 'Acesso negado: é necessário um token JWT de aprovação válido ou credencial de Super-Admin.'
            });
        }

        if (!targetUid) {
            return res.status(400).json({ error: 'ID do usuário (uid) não informado para aprovação.' });
        }

        const userRef = db.collection('usuarios').doc(targetUid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ error: 'Usuário não encontrado no Firestore.' });
        }

        const userData = userSnap.data();

        // Altera o status do usuário no Firestore de 'pendente' para 'aprovado'
        await userRef.update({
            status: 'aprovado',
            aprovado: true,
            aprovadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        // Se a requisição vier do clique no link do e-mail pelo navegador (GET), exibe página HTML amigável
        const aceitaHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
        if (aceitaHtml) {
            return res.status(200).send(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Conta Aprovada - Estocaí</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="min-h-screen flex items-center justify-center bg-orange-50 p-4 font-sans">
                    <div class="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-orange-100">
                        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-black">
                            ✓
                        </div>
                        <h1 class="text-2xl font-black text-gray-800 mb-2">Conta Aprovada com Sucesso!</h1>
                        <p class="text-sm text-gray-600 mb-6">
                            O acesso do usuário <strong>${userData.nome || targetUid}</strong> (${userData.email || ''}) — perfil <strong>${userData.cargo || 'ADMIN'}</strong> — foi liberado no sistema <strong>Estocaí</strong>.
                        </p>
                        <a href="/" class="inline-block w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 transition-all">
                            Ir para a Tela de Login
                        </a>
                    </div>
                </body>
                </html>
            `);
        }

        return res.status(200).json({
            message: 'Conta aprovada com sucesso! O usuário já pode realizar login no sistema.',
            uid: targetUid,
            nome: userData.nome,
            email: userData.email,
            cargo: userData.cargo,
            status: 'aprovado',
            aprovado: true
        });
    } catch (error) {
        console.error('[/api/auth/aprovar-usuario] Erro:', error);
        return res.status(500).json({ error: 'Erro ao processar a aprovação do usuário.' });
    }
}

router.get('/aprovar-usuario', processarAprovacaoUsuario);
router.post('/aprovar-usuario', processarAprovacaoUsuario);
router.put('/aprovar-usuario', processarAprovacaoUsuario);

/**
 * GET /api/auth/me
 * Retorna os dados do usuário autenticado e garante que o documento do tenant exista
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const tenantRef = db.collection('tenants').doc(req.tenantId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            await tenantRef.set({
                nomeFantasia: 'Estocaí Comércio',
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                limiar_estoque_minimo: 0,
                config_fidelidade: {
                    meta_compras_premio: parseInt(10, 10),
                    valor_minimo_ponto: parseFloat(0.0),
                    descricao_premio: 'Prêmio Fidelidade',
                    ativo: true
                }
            });
        }

        return res.json(req.usuario);
    } catch (error) {
        console.error('[GET /api/auth/me] Erro:', error);
        return res.status(500).json({ error: 'Erro ao obter perfil do usuário.' });
    }
});

module.exports = router;
