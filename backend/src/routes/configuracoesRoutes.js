const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin } = require('../config/firebase');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

/**
 * GET /api/configuracoes/fidelidade
 * Retorna o objeto config_fidelidade do documento /tenants/{tenantId}
 * Permitido para ADMIN e CAIXA (bloqueado para REPOSITOR/ESTOQUISTA)
 */
router.get('/fidelidade', requireRole('ADMIN', 'CAIXA'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();

        const defaultConfig = {
            ativo: true,
            valor_minimo_ponto: 0.0,
            meta_compras_premio: 10,
            descricao_premio: 'Prêmio Fidelidade'
        };

        if (!tenantSnap.exists) {
            await tenantRef.set({
                nomeFantasia: 'Estocaí Comércio',
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                config_fidelidade: defaultConfig
            });
            return res.json(defaultConfig);
        }

        const data = tenantSnap.data() || {};
        const config = data.config_fidelidade || defaultConfig;
        const limiar_estoque_minimo = Number(parseFloat(data.limiar_estoque_minimo ?? 0));

        return res.json({
            ativo: config.ativo !== undefined ? Boolean(config.ativo) : true,
            valor_minimo_ponto: Number(parseFloat(config.valor_minimo_ponto ?? 0.0)),
            meta_compras_premio: parseInt(config.meta_compras_premio ?? 10, 10),
            descricao_premio: String(config.descricao_premio || 'Prêmio Fidelidade'),
            limiar_estoque_minimo: Number.isNaN(limiar_estoque_minimo) ? 0 : limiar_estoque_minimo
        });
    } catch (error) {
        console.error('[GET /api/configuracoes/fidelidade] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar configurações de fidelidade.' });
    }
});

/**
 * PUT /api/configuracoes/fidelidade
 * Exclusivo para perfil ADMIN (adm).
 * Atualiza apenas os campos de config_fidelidade em /tenants/{tenantId} usando dot notation.
 */
router.put('/fidelidade', requireRole('ADMIN'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const ativo = Boolean(req.body.ativo);
        const valor_minimo_ponto = Number(parseFloat(req.body.valor_minimo_ponto));
        const meta_compras_premio = parseInt(req.body.meta_compras_premio, 10);
        const descricao_premio = String(req.body.descricao_premio || 'Prêmio Fidelidade').trim() || 'Prêmio Fidelidade';
        const possuiLimiar = req.body.limiar_estoque_minimo !== undefined;
        const limiar_estoque_minimo = possuiLimiar ? Number(parseFloat(req.body.limiar_estoque_minimo)) : undefined;

        if (Number.isNaN(valor_minimo_ponto) || valor_minimo_ponto < 0) {
            return res.status(400).json({ error: 'O valor mínimo para pontuar deve ser um número maior ou igual a zero.' });
        }

        if (Number.isNaN(meta_compras_premio) || meta_compras_premio < 1) {
            return res.status(400).json({ error: 'A meta de compras para o prêmio deve ser de no mínimo 1 compra.' });
        }

        if (possuiLimiar && (Number.isNaN(limiar_estoque_minimo) || limiar_estoque_minimo < 0)) {
            return res.status(400).json({ error: 'O limiar de estoque mínimo deve ser um número maior ou igual a zero.' });
        }

        const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            await tenantRef.set({
                nomeFantasia: 'Estocaí Comércio',
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                limiar_estoque_minimo: possuiLimiar ? limiar_estoque_minimo : 0,
                config_fidelidade: {
                    valor_minimo_ponto,
                    meta_compras_premio,
                    descricao_premio,
                    ativo
                }
            });
        } else {
            const camposUpdate = {
                'config_fidelidade.valor_minimo_ponto': valor_minimo_ponto,
                'config_fidelidade.meta_compras_premio': meta_compras_premio,
                'config_fidelidade.descricao_premio': descricao_premio,
                'config_fidelidade.ativo': ativo
            };
            if (possuiLimiar) {
                camposUpdate.limiar_estoque_minimo = limiar_estoque_minimo;
            }
            await admin.firestore().collection('tenants').doc(tenantId).update(camposUpdate);
        }

        const atualizadoSnap = await tenantRef.get();
        const limiarAtual = Number(parseFloat(atualizadoSnap.data()?.limiar_estoque_minimo ?? 0));

        return res.json({
            ativo,
            valor_minimo_ponto,
            meta_compras_premio,
            descricao_premio,
            limiar_estoque_minimo: Number.isNaN(limiarAtual) ? 0 : limiarAtual
        });
    } catch (error) {
        console.error('[PUT /api/configuracoes/fidelidade] Erro:', error);
        return res.status(500).json({ error: 'Erro ao atualizar configurações de fidelidade.' });
    }
});

/**
 * GET /api/configuracoes/estoque
 * Retorna o limiar_estoque_minimo do tenant (permitido para ADMIN, ESTOQUISTA e CAIXA)
 */
router.get('/estoque', requireRole('ADMIN', 'ESTOQUISTA', 'CAIXA'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            return res.json({ limiar_estoque_minimo: 0 });
        }

        const data = tenantSnap.data() || {};
        const limiar = Number(parseFloat(data.limiar_estoque_minimo ?? 0));
        return res.json({
            limiar_estoque_minimo: Number.isNaN(limiar) ? 0 : limiar
        });
    } catch (error) {
        console.error('[GET /api/configuracoes/estoque] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar configuração de limiar de estoque.' });
    }
});

/**
 * PUT /api/configuracoes/estoque
 * Exclusivo para ADMIN (adm): Atualiza o limiar_estoque_minimo em /tenants/{tenantId}
 */
router.put('/estoque', requireRole('ADMIN'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const limiar_estoque_minimo = Number(parseFloat(req.body.limiar_estoque_minimo));

        if (Number.isNaN(limiar_estoque_minimo) || limiar_estoque_minimo < 0) {
            return res.status(400).json({ error: 'O limiar de estoque mínimo deve ser um número maior ou igual a zero.' });
        }

        const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            await tenantRef.set({
                nomeFantasia: 'Estocaí Comércio',
                ativo: true,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                limiar_estoque_minimo,
                config_fidelidade: {
                    meta_compras_premio: 10,
                    valor_minimo_ponto: 0.0,
                    descricao_premio: 'Prêmio Fidelidade',
                    ativo: true
                }
            });
        } else {
            await admin.firestore().collection('tenants').doc(tenantId).update({
                limiar_estoque_minimo
            });
        }

        return res.json({ limiar_estoque_minimo });
    } catch (error) {
        console.error('[PUT /api/configuracoes/estoque] Erro:', error);
        return res.status(500).json({ error: 'Erro ao atualizar limiar de estoque mínimo.' });
    }
});

module.exports = router;
