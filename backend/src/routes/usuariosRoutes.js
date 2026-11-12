const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, requireRole, normalizarCargo } = require('../middlewares/authMiddleware');
const { enviarEmailAprovacaoUsuario } = require('../services/emailService');

router.use(authMiddleware);

// RBAC: Gestão de Usuários é estritamente exclusiva do perfil ADMIN (adm)
router.use(requireRole('ADMIN'));

/**
 * GET /api/usuarios
 * Lista os usuários em /usuarios vinculados ao req.tenantId
 */
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection('usuarios')
            .where('tenantId', '==', req.tenantId)
            .get();

        const usuarios = [];
        snapshot.forEach(doc => {
            usuarios.push({ id: doc.id, ...doc.data() });
        });
        return res.json(usuarios);
    } catch (error) {
        console.error('[GET /api/usuarios] Erro:', error);
        return res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
});

/**
 * GET /api/usuarios/:id
 * Busca um usuário do mesmo tenant
 */
router.get('/:id', async (req, res) => {
    try {
        const docSnap = await db.collection('usuarios').doc(req.params.id).get();
        if (!docSnap.exists || docSnap.data().tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        return res.json({ id: docSnap.id, ...docSnap.data() });
    } catch (error) {
        console.error('[GET /api/usuarios/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar usuário.' });
    }
});

/**
 * POST /api/usuarios
 * Cria novo colaborador no Firebase Auth e grava em /usuarios/{uid} com o Schema obrigatório:
 * nome (string), email (string), cargo (string), ativo (boolean), tenantId (string)
 */
router.post('/', async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const cargo = normalizarCargo(req.body.cargo) || 'CAIXA';
        const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : true;
        const senha = String(req.body.senha || '').trim();

        if (!nome || !email || senha.length < 6) {
            return res.status(400).json({ error: 'Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios.' });
        }

        const userRecord = await admin.auth().createUser({
            email,
            password: senha,
            displayName: nome,
            disabled: !ativo
        });

        // [STATUS PENDENTE] Toda nova conta criada (adm, caixa ou repositor) inicia com status: 'pendente'
        const novoUsuario = {
            nome: String(nome),
            email: String(email),
            cargo: String(cargo),
            ativo: Boolean(ativo),
            status: 'pendente',
            aprovado: false,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            tenantId: String(req.tenantId)
        };

        await db.collection('usuarios').doc(userRecord.uid).set(novoUsuario);

        // [SERVIÇO DE E-MAIL] Dispara e-mail para os fornecedores (process.env.ADMIN_EMAIL) aprovarem a nova conta
        try {
            await enviarEmailAprovacaoUsuario({
                uid: userRecord.uid,
                nome,
                email,
                cargo,
                tenantId: String(req.tenantId)
            });
        } catch (mailErr) {
            console.error('[POST /api/usuarios] Aviso ao enviar e-mail de aprovação:', mailErr.message);
        }

        return res.status(201).json({
            id: userRecord.uid,
            ...novoUsuario,
            message: 'Cadastro realizado com sucesso! Sua conta passará por uma análise e você será liberado em breve.'
        });
    } catch (error) {
        console.error('[POST /api/usuarios] Erro:', error);
        if (error.code === 'auth/email-already-exists') {
            return res.status(409).json({ error: 'Este e-mail já está cadastrado no sistema.' });
        }
        return res.status(500).json({ error: error.message || 'Erro ao criar colaborador.' });
    }
});

/**
 * PUT /api/usuarios/:id
 * Atualiza dados de um colaborador em /usuarios/{uid}
 */
router.put('/:id', async (req, res) => {
    try {
        const docRef = db.collection('usuarios').doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists || docSnap.data().tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const atual = docSnap.data();
        const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
        const cargo = req.body.cargo !== undefined ? (normalizarCargo(req.body.cargo) || atual.cargo) : atual.cargo;
        const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : Boolean(atual.ativo);
        const senha = req.body.senha ? String(req.body.senha).trim() : '';

        const statusAtual = req.body.status !== undefined ? String(req.body.status) : (atual.status || 'aprovado');
        const aprovadoAtual = req.body.aprovado !== undefined
            ? Boolean(req.body.aprovado)
            : (statusAtual === 'aprovado' && atual.aprovado !== false);

        const usuarioAtualizado = {
            nome: String(nome),
            email: String(atual.email),
            cargo: String(cargo),
            ativo: Boolean(ativo),
            status: statusAtual,
            aprovado: aprovadoAtual,
            tenantId: String(req.tenantId)
        };

        await docRef.set(usuarioAtualizado);

        try {
            const authUpdate = { disabled: !ativo, displayName: nome };
            if (senha && senha.length >= 6) {
                authUpdate.password = senha;
            }
            await admin.auth().updateUser(req.params.id, authUpdate);
        } catch (_) {}

        return res.json({ id: docRef.id, ...usuarioAtualizado });
    } catch (error) {
        console.error('[PUT /api/usuarios/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
});

/**
 * DELETE /api/usuarios/:id
 * Exclui colaborador de /usuarios/{uid}
 */
router.delete('/:id', async (req, res) => {
    try {
        const docRef = db.collection('usuarios').doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists || docSnap.data().tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        await docRef.delete();
        try {
            await admin.auth().deleteUser(req.params.id);
        } catch (_) {}

        return res.json({ deleted: true, id: req.params.id });
    } catch (error) {
        console.error('[DELETE /api/usuarios/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
});

module.exports = router;
