const path = require('path');
const backendNodeModules = path.join(__dirname, '..', '..', 'node_modules');
if (!module.paths.includes(backendNodeModules)) {
    module.paths.unshift(backendNodeModules);
}

const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware, verificarRole } = require('../middlewares/authMiddleware');

/**
 * Helper que monta a referência de produtos sempre isolada no tenant:
 * /tenants/${req.tenantId}/produtos
 */
function getProdutosCollection(tenantId) {
    return db.collection('tenants').doc(String(tenantId)).collection('produtos');
}

/**
 * Obtém o limiar_estoque_minimo configurado no documento do tenant (/tenants/{tenantId})
 */
async function obterLimiarEstoqueTenant(tenantId) {
    try {
        const tenantSnap = await db.collection('tenants').doc(String(tenantId)).get();
        if (!tenantSnap.exists) return 0;
        const limiar = Number(parseFloat(tenantSnap.data()?.limiar_estoque_minimo ?? 0));
        return Number.isNaN(limiar) ? 0 : limiar;
    } catch (_) {
        return 0;
    }
}

/**
 * Formata e ordena o array de lotes pela data de validade crescente (regra FEFO: First Expired, First Out).
 * Mantém apenas lotes ativos com quantidade > 0.
 */
function ordenarLotesFEFO(lotesRaw) {
    if (!Array.isArray(lotesRaw)) return [];
    return lotesRaw
        .map(lote => {
            if (!lote || typeof lote !== 'object') return null;
            const numeroLote = String(lote.numeroLote || lote.lote || '').trim();
            const validade = String(lote.validade || lote.dataValidade || '').trim();
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

/**
 * Calcula a soma total das quantidades dos lotes ativos de um insumo.
 */
function somarEstoqueLotes(lotes) {
    if (!Array.isArray(lotes) || lotes.length === 0) return 0;
    const soma = lotes.reduce((acc, l) => acc + Number(parseFloat(l.quantidade || 0)), 0);
    return Number(soma.toFixed(4));
}

/**
 * Normaliza um produto do Estoque Geral para garantir que possua o array `lotes` ordenado por FEFO
 * e que `estoque` reflita a soma dos lotes ativos (criando um lote inicial sintético caso seja um item legado).
 */
function normalizarLotesInsumo(produto) {
    if (!produto || produto.tipo_estoque !== 'GERAL') {
        return produto;
    }

    let lotes = ordenarLotesFEFO(produto.lotes);
    const estoqueBruto = Number(parseFloat(produto.estoque ?? 0));

    // Compatibilidade com insumos legados já cadastrados sem array `lotes`
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

    return {
        ...produto,
        estoque: estoqueTotal,
        lotes
    };
}

/**
 * Executa o abatimento FEFO em um array de lotes já ordenado por validade crescente.
 * Retorna { lotesRestantes, lotesAbatidos, estoqueNovo }.
 */
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

    return {
        lotesRestantes,
        lotesAbatidos,
        estoqueNovo,
        restanteParaAbater
    };
}

/**
 * Enriquecimento do produto com o cálculo do alerta de limiar de reestoque e lotes FEFO no backend
 */
function anexarAlertaReestoque(produtoRaw, limiarMinimo) {
    const produto = normalizarLotesInsumo(produtoRaw);
    const qtd = Number(parseFloat(produto.estoque ?? 0));
    const precisaReestoque = qtd <= limiarMinimo;
    return {
        ...produto,
        limiar_estoque_minimo: limiarMinimo,
        precisa_reestoque: precisaReestoque,
        alerta_reestoque: precisaReestoque
            ? (qtd === 0 ? 'ESGOTADO' : 'REESTOQUE_NECESSARIO')
            : null
    };
}

/**
 * Rota pública de leitura do Cardápio Web por tenantId:
 * GET /api/produtos/public/:tenantId
 */
router.get('/public/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId é obrigatório.' });
        }

        const snapshot = await getProdutosCollection(tenantId).get();
        const produtos = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            if (p.ativo === true && p.tipo_estoque === 'DIA') {
                produtos.push({ id: doc.id, ...p });
            }
        });

        return res.json(produtos);
    } catch (error) {
        console.error('[GET /api/produtos/public/:tenantId] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar cardápio público.' });
    }
});

// Todas as rotas abaixo exigem autenticação JWT via Firebase Admin SDK
router.use(authMiddleware);

/**
 * GET /api/produtos
 * Lista todos os produtos em /tenants/${req.tenantId}/produtos
 * Calcula no servidor o alerta de limiar de reestoque (precisa_reestoque, limiar_estoque_minimo).
 * Permitido para ADMIN ('adm'), ESTOQUISTA ('repositor') e CAIXA ('caixa').
 */
router.get('/', verificarRole(['adm', 'repositor', 'caixa']), async (req, res) => {
    try {
        const limiarMinimo = await obterLimiarEstoqueTenant(req.tenantId);
        const snapshot = await getProdutosCollection(req.tenantId).get();
        const produtos = [];
        snapshot.forEach(doc => {
            produtos.push(anexarAlertaReestoque({ id: doc.id, ...doc.data() }, limiarMinimo));
        });
        return res.json(produtos);
    } catch (error) {
        console.error('[GET /api/produtos] Erro:', error);
        return res.status(500).json({ error: 'Erro ao listar produtos.' });
    }
});

/**
 * POST /api/produtos/produzir
 * Realiza a produção de lote em Transação ACID no Firestore (db.runTransaction):
 * 1. Multiplica a quantidade de cada insumo na receita pela quantidade do lote produzido.
 * 2. Verifica saldo suficiente no Estoque Geral (GERAL); aborta com HTTP 400 se insuficiente.
 * 3. Dá baixa (subtrai) no Estoque Geral e dá entrada (soma) no Estoque do Dia (DIA).
 * 4. Calcula e retorna o status de alerta de reestoque atualizado.
 * RBAC: Exclusivo para 'adm' e 'repositor' (bloqueia 'caixa' com 403).
 */
router.post('/produzir', verificarRole(['adm', 'repositor']), async (req, res) => {
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
        const limiarMinimo = await obterLimiarEstoqueTenant(tenantId);

        const resultado = await db.runTransaction(async (transaction) => {
            const produtosRef = getProdutosCollection(tenantId);
            const prodProntoRef = produtosRef.doc(produtoId);

            // 1. Leitura do Produto Pronto (Estoque do Dia)
            const prodProntoSnap = await transaction.get(prodProntoRef);
            if (!prodProntoSnap.exists) {
                throw new Error('Produto Pronto não encontrado no inventário.');
            }

            const prodProntoData = prodProntoSnap.data();
            if (prodProntoData.tipo_estoque !== 'DIA') {
                throw new Error('Apenas produtos do Estoque do Dia podem ter lotes produzidos.');
            }

            const receita = Array.isArray(prodProntoData.receita) ? prodProntoData.receita : [];

            // 2. Leitura de todos os insumos da Ficha Técnica (Receita)
            const leiturasInsumos = [];
            for (const itemReceita of receita) {
                const insumoId = String(itemReceita.insumoId || '').trim();
                const qtdPorUnidade = Number(parseFloat(itemReceita.quantidade || 0));
                if (!insumoId || qtdPorUnidade <= 0) continue;

                const insumoRef = produtosRef.doc(insumoId);
                const insumoSnap = await transaction.get(insumoRef);
                leiturasInsumos.push({ insumoId, qtdPorUnidade, insumoRef, insumoSnap });
            }

            // 3. Validação de saldo e cálculo de baixa FEFO de todos os insumos antes de qualquer escrita
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
                    lotesAbatidos,
                    precisa_reestoque: estoqueNovo <= limiarMinimo
                });
            }

            // 4. Escrita Atômica: Baixa por FEFO no Estoque Geral e Entrada no Estoque do Dia
            for (const baixa of baixasPlanejadas) {
                transaction.update(baixa.insumoRef, {
                    estoque: baixa.estoqueNovo,
                    lotes: baixa.lotesRestantes
                });
            }

            const estoqueDiaAnterior = Number(parseFloat(prodProntoData.estoque || 0));
            const estoqueDiaNovo = Number((estoqueDiaAnterior + quantidadeLote).toFixed(4));

            transaction.update(prodProntoRef, {
                estoque: estoqueDiaNovo,
                ultimaProducaoEm: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                produtoId,
                nomeProduto: prodProntoData.nome,
                quantidadeProduzida: quantidadeLote,
                estoqueDiaAnterior,
                estoqueDiaNovo,
                precisa_reestoque: estoqueDiaNovo <= limiarMinimo,
                limiar_estoque_minimo: limiarMinimo,
                insumosConsumidos: baixasPlanejadas.map(b => ({
                    insumoId: b.insumoId,
                    nome: b.nome,
                    unidade: b.unidade,
                    consumido: b.consumido,
                    estoqueAnterior: b.estoqueAnterior,
                    estoqueNovo: b.estoqueNovo,
                    lotesAbatidos: b.lotesAbatidos,
                    lotesRestantes: b.lotesRestantes,
                    precisa_reestoque: b.precisa_reestoque
                }))
            };
        });

        return res.status(200).json({
            message: `Produção concluída: +${resultado.quantidadeProduzida} un de "${resultado.nomeProduto}" adicionadas ao Estoque do Dia.`,
            ...resultado
        });
    } catch (error) {
        console.error('[POST /api/produtos/produzir] Erro na transação:', error.message);
        return res.status(400).json({
            error: error.message || 'Não foi possível concluir a produção do lote.'
        });
    }
});

/**
 * GET /api/produtos/:id
 * Busca um produto específico em /tenants/${req.tenantId}/produtos/:id
 */
router.get('/:id', verificarRole(['adm', 'repositor', 'caixa']), async (req, res) => {
    try {
        const limiarMinimo = await obterLimiarEstoqueTenant(req.tenantId);
        const docSnap = await getProdutosCollection(req.tenantId).doc(req.params.id).get();
        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        return res.json(anexarAlertaReestoque({ id: docSnap.id, ...docSnap.data() }, limiarMinimo));
    } catch (error) {
        console.error('[GET /api/produtos/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao buscar produto.' });
    }
});

/**
 * Sanitiza e valida o array de ficha técnica (receita) de um Produto Pronto (DIA)
 * Formato: [{ insumoId: "id_do_produto_estoque_geral", quantidade: number }]
 */
function sanitizarReceita(receitaRaw, tipo_estoque) {
    if (tipo_estoque !== 'DIA' || !Array.isArray(receitaRaw)) {
        return [];
    }
    const mapa = new Map();
    for (const item of receitaRaw) {
        if (!item || typeof item !== 'object') continue;
        const insumoId = String(item.insumoId || '').trim();
        const quantidade = Number(parseFloat(item.quantidade));
        if (!insumoId || Number.isNaN(quantidade) || quantidade <= 0) continue;

        if (mapa.has(insumoId)) {
            const anterior = mapa.get(insumoId);
            anterior.quantidade = Number((anterior.quantidade + quantidade).toFixed(4));
        } else {
            mapa.set(insumoId, {
                insumoId,
                quantidade: Number(quantidade.toFixed(4))
            });
        }
    }
    return Array.from(mapa.values());
}

/**
 * POST /api/produtos
 * RBAC: Exclusivo para 'adm' e 'repositor'. Bloqueia 'caixa' com Erro 403.
 * Para itens do Estoque Geral ('GERAL'), suporta entrada de lotes (numeroLote, validade, quantidade)
 * mantendo o array `lotes` ordenado por FEFO (validade mais próxima primeiro) e `estoque` como a soma dos lotes.
 */
router.post('/', verificarRole(['adm', 'repositor']), async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const categoria = String(req.body.categoria || 'Geral').trim();
        const unidade = String(req.body.unidade || 'un').trim();
        const tipoRaw = String(req.body.tipo_estoque || req.body.destinoEstoque || 'DIA').trim().toUpperCase();
        const tipo_estoque = ['GERAL', 'ESTOQUE_GERAL', 'MATERIA_PRIMA'].includes(tipoRaw) ? 'GERAL' : 'DIA';
        const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : true;

        const preco = parseFloat(req.body.preco ?? 0);
        const estoque = parseFloat(req.body.estoque ?? req.body.quantidadeLote ?? 0);

        if (!nome) {
            return res.status(400).json({ error: 'O campo nome é obrigatório.' });
        }
        if (Number.isNaN(preco) || preco < 0) {
            return res.status(400).json({ error: 'O campo preco deve ser um número válido (double).' });
        }
        if (Number.isNaN(estoque) || estoque < 0) {
            return res.status(400).json({ error: 'O campo estoque / quantidade do lote deve ser um número válido.' });
        }

        const limiarMinimo = await obterLimiarEstoqueTenant(req.tenantId);
        const produtosRef = getProdutosCollection(req.tenantId);

        if (tipo_estoque === 'GERAL') {
            const numeroLote = String(req.body.numeroLote || '').trim();
            const validade = String(req.body.validade || req.body.dataValidade || '').trim();
            const lotesBody = Array.isArray(req.body.lotes) ? ordenarLotesFEFO(req.body.lotes) : [];

            if (!numeroLote && lotesBody.length === 0) {
                return res.status(400).json({ error: 'Para Matéria-Prima (Estoque Geral), o Número do Lote é obrigatório.' });
            }
            if (!validade && lotesBody.length === 0) {
                return res.status(400).json({ error: 'Para Matéria-Prima (Estoque Geral), a Data de Validade é obrigatória.' });
            }
            if (estoque <= 0 && lotesBody.length === 0) {
                return res.status(400).json({ error: 'A quantidade do lote deve ser maior que zero.' });
            }

            const novosLotesEntrada = lotesBody.length > 0
                ? lotesBody
                : [{ numeroLote, validade, quantidade: Number(estoque.toFixed(4)) }];

            // Verifica se já existe um insumo com o mesmo nome no Estoque Geral deste tenant para somar o lote
            const snapExistentes = await produtosRef.get();
            let docInsumoExistente = null;
            snapExistentes.forEach(doc => {
                const d = doc.data();
                if (
                    d.tipo_estoque === 'GERAL' &&
                    String(d.nome || '').trim().toLowerCase() === nome.toLowerCase()
                ) {
                    docInsumoExistente = { id: doc.id, ref: produtosRef.doc(doc.id), data: d };
                }
            });

            if (docInsumoExistente) {
                const normalizado = normalizarLotesInsumo(docInsumoExistente.data);
                const lotesCombinados = [...(normalizado.lotes || [])];

                for (const novoLote of novosLotesEntrada) {
                    const idxMesmoLote = lotesCombinados.findIndex(
                        l =>
                            l.numeroLote.toLowerCase() === novoLote.numeroLote.toLowerCase() &&
                            l.validade === novoLote.validade
                    );
                    if (idxMesmoLote >= 0) {
                        lotesCombinados[idxMesmoLote].quantidade = Number(
                            (lotesCombinados[idxMesmoLote].quantidade + novoLote.quantidade).toFixed(4)
                        );
                    } else {
                        lotesCombinados.push(novoLote);
                    }
                }

                const lotesOrdenados = ordenarLotesFEFO(lotesCombinados);
                const estoqueTotal = somarEstoqueLotes(lotesOrdenados);

                const insumoAtualizado = {
                    ...docInsumoExistente.data,
                    ativo: Boolean(ativo),
                    nome: docInsumoExistente.data.nome || String(nome),
                    categoria: String(categoria || docInsumoExistente.data.categoria || 'Geral'),
                    preco: Number(parseFloat(preco || docInsumoExistente.data.preco || 0)),
                    unidade: String(unidade || docInsumoExistente.data.unidade || 'un'),
                    tipo_estoque: 'GERAL',
                    estoque: estoqueTotal,
                    lotes: lotesOrdenados,
                    receita: []
                };

                await docInsumoExistente.ref.set(insumoAtualizado);
                return res.status(201).json(
                    anexarAlertaReestoque({ id: docInsumoExistente.id, ...insumoAtualizado }, limiarMinimo)
                );
            }

            const lotesIniciais = ordenarLotesFEFO(novosLotesEntrada);
            const estoqueTotal = somarEstoqueLotes(lotesIniciais);

            const novoInsumo = {
                ativo: Boolean(ativo),
                nome: String(nome),
                categoria: String(categoria),
                preco: Number(parseFloat(preco)),
                estoque: estoqueTotal,
                unidade: String(unidade),
                tipo_estoque: 'GERAL',
                lotes: lotesIniciais,
                receita: []
            };

            const docRef = await produtosRef.add(novoInsumo);
            return res.status(201).json(anexarAlertaReestoque({ id: docRef.id, ...novoInsumo }, limiarMinimo));
        }

        const receita = sanitizarReceita(req.body.receita, tipo_estoque);

        const novoProduto = {
            ativo: Boolean(ativo),
            nome: String(nome),
            categoria: String(categoria),
            preco: Number(parseFloat(preco)),
            estoque: Number(parseFloat(estoque)),
            unidade: String(unidade),
            tipo_estoque: String(tipo_estoque),
            receita
        };

        const docRef = await produtosRef.add(novoProduto);
        return res.status(201).json(anexarAlertaReestoque({ id: docRef.id, ...novoProduto }, limiarMinimo));
    } catch (error) {
        console.error('[POST /api/produtos] Erro:', error);
        return res.status(500).json({ error: 'Erro ao cadastrar produto.' });
    }
});

/**
 * PUT /api/produtos/:id
 * RBAC: Exclusivo para 'adm' e 'repositor'. Bloqueia 'caixa' com Erro 403.
 */
router.put('/:id', verificarRole(['adm', 'repositor']), async (req, res) => {
    try {
        const docRef = getProdutosCollection(req.tenantId).doc(req.params.id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }

        const atual = normalizarLotesInsumo(docSnap.data());

        const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
        const categoria = req.body.categoria !== undefined ? String(req.body.categoria).trim() : atual.categoria;
        const unidade = req.body.unidade !== undefined ? String(req.body.unidade).trim() : atual.unidade;
        const tipoRaw = req.body.tipo_estoque !== undefined
            ? String(req.body.tipo_estoque).trim().toUpperCase()
            : String(atual.tipo_estoque || 'DIA').trim().toUpperCase();
        const tipo_estoque = ['GERAL', 'ESTOQUE_GERAL', 'MATERIA_PRIMA'].includes(tipoRaw) ? 'GERAL' : 'DIA';
        const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : Boolean(atual.ativo);

        const preco = req.body.preco !== undefined ? parseFloat(req.body.preco) : parseFloat(atual.preco ?? 0);
        const estoqueInput = req.body.estoque !== undefined ? parseFloat(req.body.estoque) : parseFloat(atual.estoque ?? 0);

        if (!nome) {
            return res.status(400).json({ error: 'O campo nome não pode ser vazio.' });
        }
        if (Number.isNaN(preco) || preco < 0) {
            return res.status(400).json({ error: 'O campo preco deve ser um número válido (double).' });
        }
        if (Number.isNaN(estoqueInput) || estoqueInput < 0) {
            return res.status(400).json({ error: 'O campo estoque deve ser um número válido (double).' });
        }

        if (tipo_estoque === 'GERAL') {
            const numeroLote = String(req.body.numeroLote || '').trim();
            const validade = String(req.body.validade || req.body.dataValidade || '').trim();
            const modoEntradaLote = Boolean(req.body.modoEntradaLote);
            let lotesFinais = Array.isArray(atual.lotes) ? ordenarLotesFEFO(atual.lotes) : [];

            if (Array.isArray(req.body.lotes)) {
                lotesFinais = ordenarLotesFEFO(req.body.lotes);
            } else if (modoEntradaLote) {
                if (!numeroLote || !validade || estoqueInput <= 0) {
                    return res.status(400).json({
                        error: 'Informe Número do Lote, Data de Validade e Quantidade do Lote maior que zero.'
                    });
                }
                const idxMesmo = lotesFinais.findIndex(
                    l => l.numeroLote.toLowerCase() === numeroLote.toLowerCase() && l.validade === validade
                );
                if (idxMesmo >= 0) {
                    lotesFinais[idxMesmo].quantidade = Number(
                        (lotesFinais[idxMesmo].quantidade + estoqueInput).toFixed(4)
                    );
                } else {
                    lotesFinais.push({
                        numeroLote,
                        validade,
                        quantidade: Number(estoqueInput.toFixed(4))
                    });
                }
                lotesFinais = ordenarLotesFEFO(lotesFinais);
            } else if (numeroLote && validade) {
                if (lotesFinais.length <= 1) {
                    lotesFinais = estoqueInput > 0
                        ? [{ numeroLote, validade, quantidade: Number(estoqueInput.toFixed(4)) }]
                        : [];
                } else {
                    // Atualiza o 1º lote FEFO ou adiciona novo lote mantendo ordenação FEFO
                    lotesFinais[0] = {
                        numeroLote,
                        validade,
                        quantidade: Number(estoqueInput.toFixed(4))
                    };
                    lotesFinais = ordenarLotesFEFO(lotesFinais);
                }
            }

            const estoqueCalculado = somarEstoqueLotes(lotesFinais);

            const insumoAtualizado = {
                ativo: Boolean(ativo),
                nome: String(nome),
                categoria: String(categoria),
                preco: Number(parseFloat(preco)),
                estoque: estoqueCalculado,
                unidade: String(unidade),
                tipo_estoque: 'GERAL',
                lotes: lotesFinais,
                receita: []
            };

            await docRef.set(insumoAtualizado);
            const limiarMinimo = await obterLimiarEstoqueTenant(req.tenantId);
            return res.json(anexarAlertaReestoque({ id: docRef.id, ...insumoAtualizado }, limiarMinimo));
        }

        const receita = req.body.receita !== undefined
            ? sanitizarReceita(req.body.receita, tipo_estoque)
            : sanitizarReceita(atual.receita, tipo_estoque);

        const produtoAtualizado = {
            ativo: Boolean(ativo),
            nome: String(nome),
            categoria: String(categoria),
            preco: Number(parseFloat(preco)),
            estoque: Number(parseFloat(estoqueInput)),
            unidade: String(unidade),
            tipo_estoque: String(tipo_estoque),
            receita
        };

        await docRef.set(produtoAtualizado);
        const limiarMinimo = await obterLimiarEstoqueTenant(req.tenantId);
        return res.json(anexarAlertaReestoque({ id: docRef.id, ...produtoAtualizado }, limiarMinimo));
    } catch (error) {
        console.error('[PUT /api/produtos/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao atualizar produto.' });
    }
});

/**
 * DELETE /api/produtos/:id
 * RBAC: Exclusivo para 'adm' e 'repositor'. Bloqueia 'caixa' com Erro 403.
 */
router.delete('/:id', verificarRole(['adm', 'repositor']), async (req, res) => {
    try {
        const docRef = getProdutosCollection(req.tenantId).doc(req.params.id);
        await docRef.delete();
        return res.json({ deleted: true, id: req.params.id });
    } catch (error) {
        console.error('[DELETE /api/produtos/:id] Erro:', error);
        return res.status(500).json({ error: 'Erro ao excluir produto.' });
    }
});

module.exports = router;
