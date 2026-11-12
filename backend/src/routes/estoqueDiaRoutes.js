const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// RBAC: Apenas ADMIN (adm) e ESTOQUISTA (repositor) podem produzir lotes no Estoque do Dia
router.use(requireRole('ADMIN', 'ESTOQUISTA'));

function ordenarLotesFEFO(lotesRaw) {
    if (!Array.isArray(lotesRaw)) return [];
    return lotesRaw
        .map(lote => {
            if (!lote || typeof lote !== 'object') return null;
            const numeroLote = String(lote.numeroLote || '').trim();
            const validade = String(lote.validade || '').trim();
            const quantidade = Number(parseFloat(lote.quantidade ?? 0));
            if (!numeroLote || !validade || Number.isNaN(quantidade) || quantidade <= 0) {
                return null;
            }
            return {
                numeroLote,
                validade,
                quantidade: Number(quantidade.toFixed(4))
            };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.validade) - new Date(b.validade));
}

function somarEstoqueLotes(lotes) {
    if (!Array.isArray(lotes) || lotes.length === 0) return 0;
    const soma = lotes.reduce((acc, l) => acc + Number(parseFloat(l.quantidade || 0)), 0);
    return Number(soma.toFixed(4));
}

function normalizarLotesInsumo(produto) {
    if (!produto || produto.tipo_estoque !== 'GERAL') return produto;
    let lotes = ordenarLotesFEFO(produto.lotes);
    const estoqueBruto = Number(parseFloat(produto.estoque ?? 0));
    if (lotes.length === 0 && !Array.isArray(produto.lotes) && estoqueBruto > 0) {
        const prefixo = String(produto.nome || 'GER')
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 1)
            .toUpperCase() || 'G';
        lotes = [
            {
                numeroLote: `LOTE-${prefixo}01`,
                validade: '2026-11-10',
                quantidade: Number(estoqueBruto.toFixed(4))
            }
        ];
    }
    const estoqueTotal = (Array.isArray(produto.lotes) || lotes.length > 0)
        ? somarEstoqueLotes(lotes)
        : Number((Number.isNaN(estoqueBruto) ? 0 : estoqueBruto).toFixed(4));
    return { ...produto, estoque: estoqueTotal, lotes };
}

function aplicarBaixaFEFO(lotesOrdenados, consumoTotal) {
    let restanteParaAbater = Number(parseFloat(consumoTotal).toFixed(4));
    const lotesClonados = ordenarLotesFEFO(lotesOrdenados).map(l => ({ ...l }));
    const lotesAbatidos = [];

    for (const lote of lotesClonados) {
        if (restanteParaAbater <= 0) break;
        if (lote.quantidade > restanteParaAbater) {
            const abatido = restanteParaAbater;
            lote.quantidade = Number((lote.quantidade - restanteParaAbater).toFixed(4));
            restanteParaAbater = 0;
            lotesAbatidos.push({
                numeroLote: lote.numeroLote,
                validade: lote.validade,
                quantidadeAbatida: abatido,
                quantidadeRestanteNoLote: lote.quantidade
            });
        } else {
            const abatido = lote.quantidade;
            restanteParaAbater = Number((restanteParaAbater - lote.quantidade).toFixed(4));
            lote.quantidade = 0;
            lotesAbatidos.push({
                numeroLote: lote.numeroLote,
                validade: lote.validade,
                quantidadeAbatida: abatido,
                quantidadeRestanteNoLote: 0
            });
        }
    }

    const lotesRestantes = lotesClonados.filter(l => l.quantidade > 0);
    const estoqueNovo = somarEstoqueLotes(lotesRestantes);
    return { lotesRestantes, lotesAbatidos, estoqueNovo, restanteParaAbater };
}

/**
 * POST /api/estoque-dia/produzir
 * Executa a produção de um lote de Produto Pronto (Estoque do Dia) em transação ACID com baixa por FEFO:
 * 1. Multiplica a quantidade de cada insumo na receita pela quantidade do lote produzido.
 * 2. Ordena os lotes ativos do insumo por data de validade crescente (FEFO).
 * 3. Verifica se há saldo suficiente nos lotes ativos no Estoque Geral (aborta com HTTP 400 se faltar).
 * 4. Dá baixa (subtrai) dos lotes na ordem FEFO, removendo lotes zerados e recalculando `estoque`.
 * 5. Dá entrada (soma) a quantidade produzida no Estoque do Dia.
 */
router.post('/produzir', async (req, res) => {
    const tenantId = req.tenantId;
    const produtoId = String(
        req.body.produtoId || req.body.produtoDiaId || req.body.selectedProdutoId || req.body.id || ''
    ).trim();
    const quantidadeLote = Number(
        parseFloat(req.body.quantidadeLote ?? req.body.quantidadeProduzida ?? req.body.quantidade)
    );

    if (!produtoId) {
        return res.status(400).json({ error: 'Selecione um Produto Pronto (Estoque do Dia) para produzir.' });
    }

    if (Number.isNaN(quantidadeLote) || quantidadeLote <= 0) {
        return res.status(400).json({ error: 'A quantidade do lote a produzir deve ser maior que zero.' });
    }

    try {
        const resultado = await db.runTransaction(async (transaction) => {
            const produtosRef = db.collection('tenants').doc(tenantId).collection('produtos');
            const prodProntoRef = produtosRef.doc(produtoId);

            // 1. Fase de Leitura: Produto Pronto
            const prodProntoSnap = await transaction.get(prodProntoRef);
            if (!prodProntoSnap.exists) {
                throw new Error('Produto Pronto não encontrado no inventário.');
            }

            const prodProntoData = prodProntoSnap.data();
            if (prodProntoData.tipo_estoque !== 'DIA') {
                throw new Error('Apenas produtos do Estoque do Dia podem ter lotes produzidos.');
            }

            const receita = Array.isArray(prodProntoData.receita) ? prodProntoData.receita : [];

            // 2. Fase de Leitura: Todos os insumos da Ficha Técnica (Receita)
            const leiturasInsumos = [];
            for (const itemReceita of receita) {
                const insumoId = String(itemReceita.insumoId || '').trim();
                const qtdPorUnidade = Number(parseFloat(itemReceita.quantidade || 0));
                if (!insumoId || qtdPorUnidade <= 0) continue;

                const insumoRef = produtosRef.doc(insumoId);
                const insumoSnap = await transaction.get(insumoRef);
                leiturasInsumos.push({
                    insumoId,
                    qtdPorUnidade,
                    insumoRef,
                    insumoSnap
                });
            }

            // 3. Validação de saldo e baixa FEFO de todos os insumos antes de qualquer escrita
            const baixasPlanejadas = [];
            for (const { insumoId, qtdPorUnidade, insumoRef, insumoSnap } of leiturasInsumos) {
                if (!insumoSnap.exists) {
                    throw new Error(`Insumo da receita (ID: ${insumoId}) não foi encontrado no Estoque Geral.`);
                }

                const insumoNormalizado = normalizarLotesInsumo(insumoSnap.data());
                const lotesOrdenados = ordenarLotesFEFO(insumoNormalizado.lotes);
                const estoqueInsumoAtual = somarEstoqueLotes(lotesOrdenados);
                const consumoTotal = Number((qtdPorUnidade * quantidadeLote).toFixed(4));

                if (estoqueInsumoAtual < consumoTotal) {
                    throw new Error(
                        `Saldo insuficiente no Estoque Geral para o insumo "${insumoNormalizado.nome}". ` +
                        `Necessário para o lote: ${consumoTotal} ${insumoNormalizado.unidade || 'un'}, ` +
                        `Disponível nos lotes ativos: ${estoqueInsumoAtual} ${insumoNormalizado.unidade || 'un'}.`
                    );
                }

                const { lotesRestantes, lotesAbatidos, estoqueNovo } = aplicarBaixaFEFO(lotesOrdenados, consumoTotal);

                baixasPlanejadas.push({
                    insumoId,
                    insumoRef,
                    nome: insumoNormalizado.nome,
                    unidade: insumoNormalizado.unidade || 'un',
                    consumido: consumoTotal,
                    estoqueAnterior: estoqueInsumoAtual,
                    estoqueNovo,
                    lotesRestantes,
                    lotesAbatidos
                });
            }

            // 4. Fase de Escrita: Baixa por FEFO dos insumos no Estoque Geral
            for (const baixa of baixasPlanejadas) {
                transaction.update(baixa.insumoRef, {
                    estoque: baixa.estoqueNovo,
                    lotes: baixa.lotesRestantes
                });
            }

            // 5. Fase de Escrita: Entrada do lote produzido no Estoque do Dia
            const estoqueAtualProduto = Number(parseFloat(prodProntoData.estoque || 0));
            const novoEstoqueProduto = Number((estoqueAtualProduto + quantidadeLote).toFixed(4));

            transaction.update(prodProntoRef, {
                estoque: novoEstoqueProduto,
                ultimaProducaoEm: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                produtoId,
                nomeProduto: prodProntoData.nome,
                unidade: prodProntoData.unidade || 'un',
                quantidadeProduzida: quantidadeLote,
                estoqueAnterior: estoqueAtualProduto,
                estoqueAtual: novoEstoqueProduto,
                insumosConsumidos: baixasPlanejadas.map(b => ({
                    insumoId: b.insumoId,
                    nome: b.nome,
                    unidade: b.unidade,
                    consumido: b.consumido,
                    estoqueRestante: b.estoqueNovo,
                    lotesAbatidos: b.lotesAbatidos,
                    lotesRestantes: b.lotesRestantes
                }))
            };
        });

        return res.status(200).json(resultado);
    } catch (error) {
        console.error('[POST /api/estoque-dia/produzir] Erro na produção de lote:', error.message);
        return res.status(400).json({ error: error.message || 'Erro ao produzir lote.' });
    }
});

module.exports = router;

