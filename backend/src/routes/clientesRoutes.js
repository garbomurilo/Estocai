const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { authMiddleware, verificarRole, normalizarCargo } = require('../middlewares/authMiddleware');

/**
 * Helper que monta a referência de clientes sempre isolada no tenant:
 * /tenants/${req.tenantId}/clientes
 */
function getClientesCollection(tenantId) {
    return db.collection('tenants').doc(String(tenantId)).collection('clientes');
}

/**
 * Mascara o CPF no servidor (ex: ***.456.789-**) para proteger dados sensíveis (LGPD).
 * Perfis não-administradores ('caixa') nunca recebem o CPF puro na resposta da API.
 */
function mascararCpfBackend(cpfRaw) {
    const digitos = String(cpfRaw || '').replace(/\D/g, '');
    if (digitos.length === 11) {
        return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
    }
    if (digitos.length >= 2) {
        return `***.***.***-${digitos.slice(-2)}`;
    }
    return '***.***.***-**';
}

/**
 * Obtém a meta de compras do Programa de Fidelidade do tenant no Firestore
 */
async function obterMetaFidelidadeTenant(tenantId) {
    try {
        const tenantSnap = await db.collection('tenants').doc(String(tenantId)).get();
        const meta = parseInt(tenantSnap.data()?.config_fidelidade?.meta_compras_premio ?? 10, 10);
        return Number.isNaN(meta) || meta < 1 ? 10 : meta;
    } catch (_) {
        return 10;
    }
}

/**
 * Formata o documento do cliente aplicando o mascaramento de CPF no backend
 * (envia o CPF puro apenas se o requisitante tiver role 'ADMIN') e valida a meta de fidelidade.
 */
function serializarClienteParaResposta(id, data, cargoUsuario, metaCompras = 10) {
    const isAdm = normalizarCargo(cargoUsuario) === 'ADMIN';
    const cpfMascarado = mascararCpfBackend(data.cpf);
    const qtdCompras = parseInt(data.fidelidade?.quantidade_compras_validas || 0, 10);
    const elegivel = Boolean(data.fidelidade?.elegivel_premio) || qtdCompras >= metaCompras;

    return {
        id,
        nome: data.nome,
        // Se NÃO for 'adm', o backend envia apenas o CPF mascarado
        cpf: isAdm ? data.cpf : cpfMascarado,
        cpf_mascarado: cpfMascarado,
        telefone: data.telefone,
        fidelidade: {
            quantidade_compras_validas: qtdCompras,
            elegivel_premio: elegivel,
            meta_compras_premio: metaCompras
        }
    };
}

router.use(authMiddleware);

// RBAC: Bloqueia 'repositor' (ESTOQUISTA) com Erro 403 em /api/clientes e /api/fidelidade
router.use(verificarRole(['adm', 'caixa']));

/**
 * GET /api/clientes
 * Lista todos os clientes de /tenants/${req.tenantId}/clientes com CPF mascarado para não-adm
 */
router.get('/', async (req, res) => {
    try {
        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);
        const snapshot = await getClientesCollection(req.tenantId).get();
        const clientes = [];
        snapshot.forEach(doc => {
            clientes.push(
                serializarClienteParaResposta(doc.id, doc.data(), req.usuario?.cargo, metaCompras)
            );
        });
        return res.json(clientes);
    } catch (error) {
        console.error('[GET /api/clientes] Erro:', error);
        return res.status(500).json({ error: 'Erro ao listar clientes.' });
    }
});

/**
 * GET /api/clientes/:id
 * Busca um cliente em /tenants/${req.tenantId}/clientes/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);
        const docSnap = await getClientesCollection(req.tenantId).doc(req.params.id).get();
        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        return res.json(
            serializarClienteParaResposta(docSnap.id, docSnap.data(), req.usuario?.cargo, metaCompras)
        );
    } catch (error) {
        console.error('[GET /api/clientes/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar cliente.' });
    }
});

/**
 * POST /api/clientes
 * Permitido para 'adm' e 'caixa'.
 * Inicializa fidelidade com quantidade_compras_validas: 0 e elegivel_premio: false.
 */
router.post('/', async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const cpf = String(req.body.cpf || '').trim();
        const telefone = String(req.body.telefone || '').trim();

        if (!nome || !cpf || !telefone) {
            return res.status(400).json({ error: 'Nome, CPF e telefone são obrigatórios.' });
        }

        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);
        const novoCliente = {
            nome: String(nome),
            cpf: String(cpf),
            telefone: String(telefone),
            fidelidade: {
                quantidade_compras_validas: parseInt(0, 10),
                elegivel_premio: false
            }
        };

        const docRef = await getClientesCollection(req.tenantId).add(novoCliente);
        return res.status(201).json(
            serializarClienteParaResposta(docRef.id, novoCliente, req.usuario?.cargo, metaCompras)
        );
    } catch (error) {
        console.error('[POST /api/clientes] Erro:', error);
        return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
    }
});

/**
 * POST /api/clientes/:id/compra
 * Permitido para 'adm' e 'caixa': soma +1 compra elegível e valida a meta de fidelidade no servidor.
 */
router.post('/:id/compra', async (req, res) => {
    try {
        const docRef = getClientesCollection(req.tenantId).doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);
        const atual = docSnap.data();
        const novasCompras = parseInt(atual.fidelidade?.quantidade_compras_validas || 0, 10) + 1;
        const elegivelPremio = novasCompras >= metaCompras;

        await docRef.update({
            'fidelidade.quantidade_compras_validas': parseInt(novasCompras, 10),
            'fidelidade.elegivel_premio': Boolean(elegivelPremio)
        });

        const atualizadoSnap = await docRef.get();
        return res.json(
            serializarClienteParaResposta(atualizadoSnap.id, atualizadoSnap.data(), req.usuario?.cargo, metaCompras)
        );
    } catch (error) {
        console.error('[POST /api/clientes/:id/compra] Erro:', error);
        return res.status(500).json({ error: 'Erro ao somar compra de fidelidade.' });
    }
});

/**
 * POST /api/clientes/:id/resgatar
 * Permitido para 'adm' e 'caixa': valida no servidor se o cliente atingiu a meta e resgata o prêmio.
 */
router.post('/:id/resgatar', async (req, res) => {
    try {
        const docRef = getClientesCollection(req.tenantId).doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);
        const atual = docSnap.data();
        const comprasAtuais = parseInt(atual.fidelidade?.quantidade_compras_validas || 0, 10);

        if (comprasAtuais < metaCompras && !atual.fidelidade?.elegivel_premio) {
            return res.status(400).json({ error: 'Este cliente ainda não atingiu a meta para resgatar o prêmio.' });
        }

        const saldoRestante = Math.max(0, comprasAtuais - metaCompras);
        const continuaElegivel = saldoRestante >= metaCompras;

        await docRef.update({
            'fidelidade.quantidade_compras_validas': parseInt(saldoRestante, 10),
            'fidelidade.elegivel_premio': Boolean(continuaElegivel)
        });

        const atualizadoSnap = await docRef.get();
        return res.json(
            serializarClienteParaResposta(atualizadoSnap.id, atualizadoSnap.data(), req.usuario?.cargo, metaCompras)
        );
    } catch (error) {
        console.error('[POST /api/clientes/:id/resgatar] Erro:', error);
        return res.status(500).json({ error: 'Erro ao resgatar prêmio de fidelidade.' });
    }
});

/**
 * PUT /api/clientes/:id
 * RBAC: Exclusivo para perfil 'adm' (ADMIN). Bloqueia 'caixa' e 'repositor' com Erro 403.
 */
router.put('/:id', verificarRole(['adm']), async (req, res) => {
    try {
        const docRef = getClientesCollection(req.tenantId).doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const atual = docSnap.data();
        const metaCompras = await obterMetaFidelidadeTenant(req.tenantId);

        const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
        const cpf = req.body.cpf !== undefined ? String(req.body.cpf).trim() : atual.cpf;
        const telefone = req.body.telefone !== undefined ? String(req.body.telefone).trim() : atual.telefone;

        const qtdInformada = req.body.fidelidade?.quantidade_compras_validas !== undefined
            ? parseInt(req.body.fidelidade.quantidade_compras_validas, 10)
            : parseInt(atual.fidelidade?.quantidade_compras_validas || 0, 10);

        const quantidade_compras_validas = Number.isNaN(qtdInformada) ? 0 : Math.max(0, qtdInformada);
        const elegivel_premio = quantidade_compras_validas >= metaCompras;

        const clienteAtualizado = {
            nome: String(nome),
            cpf: String(cpf),
            telefone: String(telefone),
            fidelidade: {
                quantidade_compras_validas: parseInt(quantidade_compras_validas, 10),
                elegivel_premio: Boolean(elegivel_premio)
            }
        };

        await docRef.set(clienteAtualizado);
        return res.json(
            serializarClienteParaResposta(docRef.id, clienteAtualizado, req.usuario?.cargo, metaCompras)
        );
    } catch (error) {
        console.error('[PUT /api/clientes/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao atualizar cliente.' });
    }
});

/**
 * DELETE /api/clientes/:id
 * RBAC: Exclusivo para perfil 'adm' (ADMIN).
 */
router.delete('/:id', verificarRole(['adm']), async (req, res) => {
    try {
        const docRef = getClientesCollection(req.tenantId).doc(req.params.id);
        await docRef.delete();
        return res.json({ deleted: true, id: req.params.id });
    } catch (error) {
        console.error('[DELETE /api/clientes/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao excluir cliente.' });
    }
});

module.exports = router;
