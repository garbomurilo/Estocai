const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, verificarRole } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// RBAC: Visível e acessível apenas para perfis ADMIN ('adm') e CAIXA ('caixa'). Bloqueia 'repositor' (Erro 403).
router.use(verificarRole(['adm', 'caixa']));

/**
 * Calcula o detalhamento de vendas concluídas desde a abertura do expediente
 * agrupadas por meio de pagamento: DINHEIRO, CARTAO (Crédito/Débito) e PIX/Outros.
 */
async function calcularVendasPorMeioPeriodo(tenantId, dataAberturaISO) {
    const pedidosSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('pedidos')
        .get();

    const aberturaTime = dataAberturaISO ? new Date(dataAberturaISO).getTime() : 0;
    let vendasDinheiro = 0.0;
    let vendasCartao = 0.0;
    let vendasPix = 0.0;

    pedidosSnap.forEach(doc => {
        const p = doc.data();
        if (!p) return;
        const statusPedido = String(p.status || 'CONCLUIDO').toUpperCase();
        if (statusPedido !== 'CONCLUIDO') return;

        const dataPedidoTime = p.data_hora ? new Date(p.data_hora).getTime() : 0;
        if (aberturaTime && dataPedidoTime < aberturaTime) return;

        const valor = Number(parseFloat(p.valor_total || 0.0));
        if (Number.isNaN(valor) || valor <= 0) return;

        const formaPag = String(p.pagamento?.forma_pagamento || 'PIX').toUpperCase();
        if (formaPag === 'DINHEIRO') {
            vendasDinheiro += valor;
        } else if (formaPag === 'CARTAO' || formaPag === 'CREDITO' || formaPag === 'DEBITO' || formaPag === 'MAQUININHA') {
            vendasCartao += valor;
        } else {
            vendasPix += valor;
        }
    });

    vendasDinheiro = Number(vendasDinheiro.toFixed(2));
    vendasCartao = Number(vendasCartao.toFixed(2));
    vendasPix = Number(vendasPix.toFixed(2));
    const totalVendas = Number((vendasDinheiro + vendasCartao + vendasPix).toFixed(2));

    return {
        vendasDinheiro,
        vendasCartao,
        vendasPix,
        totalVendas
    };
}

/**
 * Busca o expediente atualmente aberto do tenant (se existir)
 */
async function obterExpedienteAberto(tenantId) {
    const snapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('expedientes')
        .where('status', '==', 'aberto')
        .get();

    if (snapshot.empty) return null;

    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => String(b.dataAbertura || '').localeCompare(String(a.dataAbertura || '')));
    return docs[0];
}

/**
 * GET /api/expedientes/atual
 * Retorna o status atual do expediente ("aberto" ou "fechado") e o detalhamento por meio de pagamento
 */
router.get('/atual', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const aberto = await obterExpedienteAberto(tenantId);

        if (!aberto) {
            return res.json({
                status: 'fechado',
                expediente: null
            });
        }

        const valorInicial = Number(parseFloat(aberto.valorInicial || 0.0).toFixed(2));
        const resumoVendas = await calcularVendasPorMeioPeriodo(tenantId, aberto.dataAbertura);

        const esperadoDinheiro = Number((valorInicial + resumoVendas.vendasDinheiro).toFixed(2));
        const esperadoCartao = resumoVendas.vendasCartao;
        const esperadoPix = resumoVendas.vendasPix;
        const valorEsperado = Number((valorInicial + resumoVendas.totalVendas).toFixed(2));

        return res.json({
            status: 'aberto',
            expediente: {
                ...aberto,
                valorInicial,
                vendasDinheiro: resumoVendas.vendasDinheiro,
                vendasCartao: resumoVendas.vendasCartao,
                vendasPix: resumoVendas.vendasPix,
                valorCalculadoVendas: resumoVendas.totalVendas,
                esperadoDinheiro,
                esperadoCartao,
                esperadoPix,
                valorEsperado
            }
        });
    } catch (error) {
        console.error('[GET /api/expedientes/atual] Erro:', error);
        return res.status(500).json({ error: 'Erro ao consultar status do expediente.' });
    }
});

/**
 * GET /api/expedientes
 * Lista o histórico de expedientes do tenant
 */
router.get('/', async (req, res) => {
    try {
        const snapshot = await db
            .collection('tenants')
            .doc(req.tenantId)
            .collection('expedientes')
            .get();

        const lista = [];
        snapshot.forEach(doc => {
            lista.push({ id: doc.id, ...doc.data() });
        });

        lista.sort((a, b) => String(b.dataAbertura || '').localeCompare(String(a.dataAbertura || '')));
        return res.json(lista);
    } catch (error) {
        console.error('[GET /api/expedientes] Erro:', error);
        return res.status(500).json({ error: 'Erro ao listar histórico de expedientes.' });
    }
});

/**
 * POST /api/expedientes/iniciar
 * Fluxo 1 — Iniciar Expediente (Fundo de Troco)
 */
router.post('/iniciar', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const existente = await obterExpedienteAberto(tenantId);
        if (existente) {
            return res.status(400).json({ error: 'Já existe um expediente aberto no momento.' });
        }

        const valorInicial = Number(parseFloat(req.body.valorInicial));
        if (Number.isNaN(valorInicial) || valorInicial < 0) {
            return res.status(400).json({ error: 'Informe um Fundo de Troco (Valor Inicial) válido (maior ou igual a R$ 0,00).' });
        }

        const expedientesRef = db.collection('tenants').doc(tenantId).collection('expedientes');
        const novoDocRef = expedientesRef.doc();

        const novoExpediente = {
            id: novoDocRef.id,
            dataAbertura: admin.firestore.FieldValue.serverTimestamp(),
            valorInicial: Number(valorInicial.toFixed(2)),
            status: 'aberto',
            operadoPor: req.uid,
            operadoPorNome: req.usuario?.nome || req.userEmail || 'Operador',
            dataFechamento: null,
            valorFinalInformado: null,
            valorCalculadoVendas: 0.0,
            discrepancia: null
        };

        await novoDocRef.set(novoExpediente);
        const salvoSnap = await novoDocRef.get();
        const salvoData = salvoSnap.data();

        return res.status(201).json({
            status: 'aberto',
            expediente: {
                ...salvoData,
                id: novoDocRef.id,
                vendasDinheiro: 0.0,
                vendasCartao: 0.0,
                vendasPix: 0.0,
                valorCalculadoVendas: 0.0,
                esperadoDinheiro: Number(valorInicial.toFixed(2)),
                esperadoCartao: 0.0,
                esperadoPix: 0.0,
                valorEsperado: Number(valorInicial.toFixed(2))
            }
        });
    } catch (error) {
        console.error('[POST /api/expedientes/iniciar] Erro:', error);
        return res.status(500).json({ error: 'Erro ao iniciar expediente.' });
    }
});

/**
 * POST /api/expedientes/encerrar
 * Fluxo 2 — Encerrar Expediente conferindo Dinheiro Físico, Cartão (Maquininha) e PIX/Outros
 */
router.post('/encerrar', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const aberto = await obterExpedienteAberto(tenantId);

        if (!aberto) {
            return res.status(400).json({ error: 'Não há expediente aberto para encerrar.' });
        }

        const confirmarDiscrepancia = Boolean(req.body.confirmarDiscrepancia);

        const valorInicial = Number(parseFloat(aberto.valorInicial || 0.0).toFixed(2));
        const resumoVendas = await calcularVendasPorMeioPeriodo(tenantId, aberto.dataAbertura);

        const esperadoDinheiro = Number((valorInicial + resumoVendas.vendasDinheiro).toFixed(2));
        const esperadoCartao = resumoVendas.vendasCartao;
        const esperadoPix = resumoVendas.vendasPix;
        const valorTotalEsperado = Number((valorInicial + resumoVendas.totalVendas).toFixed(2));

        // Suporta tanto os 3 campos detalhados quanto fallback para valorFinalInformado único
        const infDinheiroRaw = req.body.valorInformadoDinheiro !== undefined
            ? parseFloat(req.body.valorInformadoDinheiro)
            : parseFloat(req.body.valorFinalInformado);
        const infCartaoRaw = req.body.valorInformadoCartao !== undefined
            ? parseFloat(req.body.valorInformadoCartao)
            : esperadoCartao;
        const infPixRaw = req.body.valorInformadoPix !== undefined
            ? parseFloat(req.body.valorInformadoPix)
            : esperadoPix;

        if (
            Number.isNaN(infDinheiroRaw) || infDinheiroRaw < 0 ||
            Number.isNaN(infCartaoRaw) || infCartaoRaw < 0 ||
            Number.isNaN(infPixRaw) || infPixRaw < 0
        ) {
            return res.status(400).json({ error: 'Informe valores apurados válidos (maiores ou iguais a R$ 0,00) para todos os meios de pagamento.' });
        }

        const informadoDinheiro = Number(infDinheiroRaw.toFixed(2));
        const informadoCartao = Number(infCartaoRaw.toFixed(2));
        const informadoPix = Number(infPixRaw.toFixed(2));
        const valorTotalInformado = Number((informadoDinheiro + informadoCartao + informadoPix).toFixed(2));

        const diferencaDinheiro = Number((informadoDinheiro - esperadoDinheiro).toFixed(2));
        const diferencaCartao = Number((informadoCartao - esperadoCartao).toFixed(2));
        const diferencaPix = Number((informadoPix - esperadoPix).toFixed(2));
        const discrepanciaTotal = Number((valorTotalInformado - valorTotalEsperado).toFixed(2));

        const mensagensDiscrepancia = [];
        const formatarMsgMeio = (diff, labelMeio, esp, inf) => {
            if (Math.abs(diff) < 0.01) return null;
            const tipo = diff < 0 ? 'Falta' : 'Sobra';
            return `${tipo} R$ ${Math.abs(diff).toFixed(2)} em ${labelMeio} (Esperado: R$ ${esp.toFixed(2)} | Informado: R$ ${inf.toFixed(2)})`;
        };

        const msgDin = formatarMsgMeio(diferencaDinheiro, 'dinheiro físico', esperadoDinheiro, informadoDinheiro);
        const msgCar = formatarMsgMeio(diferencaCartao, 'Cartão (Maquininha)', esperadoCartao, informadoCartao);
        const msgPix = formatarMsgMeio(diferencaPix, 'PIX/Outros', esperadoPix, informadoPix);

        if (msgDin) mensagensDiscrepancia.push(msgDin);
        if (msgCar) mensagensDiscrepancia.push(msgCar);
        if (msgPix) mensagensDiscrepancia.push(msgPix);

        const houveDiscrepancia = mensagensDiscrepancia.length > 0;

        if (houveDiscrepancia && !confirmarDiscrepancia) {
            return res.status(200).json({
                requerConfirmacao: true,
                status: 'aberto',
                valorInicial,
                vendasDinheiro: resumoVendas.vendasDinheiro,
                vendasCartao: resumoVendas.vendasCartao,
                vendasPix: resumoVendas.vendasPix,
                valorCalculadoVendas: resumoVendas.totalVendas,
                esperadoDinheiro,
                esperadoCartao,
                esperadoPix,
                valorEsperado: valorTotalEsperado,
                informadoDinheiro,
                informadoCartao,
                informadoPix,
                valorFinalInformado: valorTotalInformado,
                diferencaDinheiro,
                diferencaCartao,
                diferencaPix,
                discrepancia: discrepanciaTotal,
                mensagensDiscrepancia
            });
        }

        const docRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('expedientes')
            .doc(aberto.id);

        await docRef.update({
            status: 'fechado',
            dataFechamento: admin.firestore.FieldValue.serverTimestamp(),
            valorFinalInformado: valorTotalInformado,
            valorCalculadoVendas: resumoVendas.totalVendas,
            discrepancia: discrepanciaTotal,
            detalhamentoPagamentos: {
                esperado: {
                    dinheiro: esperadoDinheiro,
                    cartao: esperadoCartao,
                    pix: esperadoPix,
                    total: valorTotalEsperado
                },
                informado: {
                    dinheiro: informadoDinheiro,
                    cartao: informadoCartao,
                    pix: informadoPix,
                    total: valorTotalInformado
                },
                diferencas: {
                    dinheiro: diferencaDinheiro,
                    cartao: diferencaCartao,
                    pix: diferencaPix,
                    total: discrepanciaTotal
                }
            },
            mensagensDiscrepancia,
            fechadoPor: req.uid
        });

        const atualizadoSnap = await docRef.get();

        return res.status(200).json({
            requerConfirmacao: false,
            status: 'fechado',
            expediente: {
                id: aberto.id,
                ...atualizadoSnap.data(),
                valorEsperado: valorTotalEsperado
            }
        });
    } catch (error) {
        console.error('[POST /api/expedientes/encerrar] Erro:', error);
        return res.status(500).json({ error: 'Erro ao encerrar expediente.' });
    }
});

module.exports = router;
