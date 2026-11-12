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

// RBAC: Apenas ADMIN e CAIXA operam Vendas/PDV (ESTOQUISTA/repositor possui bloqueio total)
router.use(requireRole('ADMIN', 'CAIXA'));

/**
 * GET /api/pedidos
 * Lista os pedidos de /tenants/${req.tenantId}/pedidos
 */
router.get('/', async (req, res) => {
    try {
        const snapshot = await db
            .collection('tenants')
            .doc(req.tenantId)
            .collection('pedidos')
            .get();

        const pedidos = [];
        snapshot.forEach(doc => {
            pedidos.push({ id: doc.id, ...doc.data() });
        });
        return res.json(pedidos);
    } catch (error) {
        console.error('[GET /api/pedidos] Erro:', error);
        return res.status(500).json({ error: 'Erro ao listar pedidos.' });
    }
});

/**
 * POST /api/pedidos
 * Passo 3: Transação do PDV (CRÍTICO) usando db.runTransaction() (ACID):
 * 1. Baixa de Estoque: Ler o estoque (double) dos itens do pedido em /tenants/${req.tenantId}/produtos/{id}. Se houver saldo, subtrair a quantidade vendida.
 * 2. Fidelidade Variável: Ler o documento do Tenant (/tenants/${req.tenantId}). Verificar o config_fidelidade. Se a regra estiver ativa, se o valor_total do pedido >= valor_minimo_ponto e houver um id_cliente, acrescente +1 (int64) na quantidade_compras_validas do cliente. Atualize elegivel_premio para true se a soma atingir a meta_compras_premio.
 * 3. Registro: Salve o pedido em /tenants/${req.tenantId}/pedidos/{id}.
 */
router.post('/', async (req, res) => {
    const tenantId = req.tenantId;
    const itensReq = Array.isArray(req.body.itens) ? req.body.itens : [];

    if (itensReq.length === 0) {
        return res.status(400).json({ error: 'O pedido deve conter ao menos um item.' });
    }

    const id_cliente = req.body.id_cliente ? String(req.body.id_cliente).trim() : null;
    const tipo_pedido = String(req.body.tipo_pedido || 'BALCAO');
    const status = String(req.body.status || 'CONCLUIDO');
    const valor_desconto = parseFloat(req.body.valor_desconto || 0.0);
    const forma_pagamento = String(req.body.pagamento?.forma_pagamento || 'PIX');
    const status_pagamento = String(req.body.pagamento?.status || 'PAGO');

    try {
        const resultado = await db.runTransaction(async (transaction) => {
            const tenantRef = db.collection('tenants').doc(tenantId);
            const produtosCollectionRef = tenantRef.collection('produtos');
            const clientesCollectionRef = tenantRef.collection('clientes');
            const pedidosCollectionRef = tenantRef.collection('pedidos');

            // =========================================================================
            // FASE DE LEITURA DA TRANSAÇÃO (Todas as leituras antes das escritas)
            // =========================================================================

            const leiturasProdutos = [];
            for (const item of itensReq) {
                const idProduto = String(item.id_produto || item.id || '');
                if (!idProduto) {
                    throw new Error('Item do pedido sem id_produto.');
                }
                const prodRef = produtosCollectionRef.doc(idProduto);
                const prodSnap = await transaction.get(prodRef);
                leiturasProdutos.push({ item, prodRef, prodSnap });
            }

            const tenantSnap = await transaction.get(tenantRef);

            let clienteRef = null;
            let clienteSnap = null;
            if (id_cliente) {
                clienteRef = clientesCollectionRef.doc(id_cliente);
                clienteSnap = await transaction.get(clienteRef);
            }

            // =========================================================================
            // PASSO 3.1: Baixa de Estoque
            // =========================================================================
            const itensFormatados = [];
            let somaSubtotais = 0.0;

            for (const { item, prodRef, prodSnap } of leiturasProdutos) {
                if (!prodSnap.exists) {
                    throw new Error(`Produto "${item.nome_produto || item.id_produto}" não encontrado.`);
                }

                const prodData = prodSnap.data();
                const estoqueAtual = parseFloat(prodData.estoque || 0.0);
                const quantidadeVendida = parseFloat(item.quantidade || 0.0);
                const precoUnitario = parseFloat(
                    item.preco_unitario !== undefined ? item.preco_unitario : prodData.preco
                );

                if (quantidadeVendida <= 0 || Number.isNaN(quantidadeVendida)) {
                    throw new Error(`Quantidade inválida para o produto "${prodData.nome}".`);
                }

                if (estoqueAtual < quantidadeVendida) {
                    throw new Error(
                        `Estoque insuficiente para "${prodData.nome}". Disponível: ${estoqueAtual}, Solicitado: ${quantidadeVendida}.`
                    );
                }

                const novoEstoque = Number(parseFloat((estoqueAtual - quantidadeVendida).toFixed(4)));
                transaction.update(prodRef, { estoque: novoEstoque });

                const subtotal = Number(parseFloat((quantidadeVendida * precoUnitario).toFixed(2)));
                somaSubtotais += subtotal;

                itensFormatados.push({
                    id_produto: String(prodSnap.id),
                    nome_produto: String(item.nome_produto || prodData.nome),
                    quantidade: Number(parseFloat(quantidadeVendida)),
                    preco_unitario: Number(parseFloat(precoUnitario)),
                    subtotal: Number(parseFloat(subtotal))
                });
            }

            const valorTotalCalculado = req.body.valor_total !== undefined
                ? Number(parseFloat(req.body.valor_total))
                : Number(parseFloat(Math.max(0, somaSubtotais - (Number.isNaN(valor_desconto) ? 0 : valor_desconto)).toFixed(2)));

            // =========================================================================
            // PASSO 3.2: Fidelidade Variável
            // =========================================================================
            const configFidelidade = tenantSnap.exists && tenantSnap.data().config_fidelidade
                ? tenantSnap.data().config_fidelidade
                : { meta_compras_premio: 10, valor_minimo_ponto: 0.0, descricao_premio: 'Prêmio Fidelidade', ativo: true };

            const regraAtiva = Boolean(configFidelidade.ativo);
            const valorMinimoPonto = parseFloat(configFidelidade.valor_minimo_ponto || 0.0);
            const metaComprasPremio = parseInt(configFidelidade.meta_compras_premio || 10, 10);
            const descricaoPremio = String(configFidelidade.descricao_premio || 'Prêmio Fidelidade');

            let infoFidelidade = {
                pontuou: false,
                quantidade_compras_validas: null,
                elegivel_premio: false,
                meta_compras_premio: metaComprasPremio,
                descricao_premio: descricaoPremio
            };

            if (regraAtiva && valorTotalCalculado >= valorMinimoPonto && id_cliente && clienteSnap && clienteSnap.exists) {
                const clienteData = clienteSnap.data();
                const comprasAtuais = parseInt(clienteData.fidelidade?.quantidade_compras_validas || 0, 10);
                const novasCompras = parseInt(comprasAtuais + 1, 10);
                const elegivelPremio = Boolean(clienteData.fidelidade?.elegivel_premio) || (novasCompras >= metaComprasPremio);

                transaction.update(clienteRef, {
                    fidelidade: {
                        quantidade_compras_validas: parseInt(novasCompras, 10),
                        elegivel_premio: Boolean(elegivelPremio)
                    }
                });

                infoFidelidade = {
                    pontuou: true,
                    quantidade_compras_validas: novasCompras,
                    elegivel_premio: elegivelPremio,
                    meta_compras_premio: metaComprasPremio,
                    descricao_premio: descricaoPremio
                };
            }

            // =========================================================================
            // PASSO 3.3: Registro do Pedido em /tenants/${req.tenantId}/pedidos/{id}
            // =========================================================================
            const novoPedidoRef = pedidosCollectionRef.doc();
            const pedidoDoc = {
                id_cliente: id_cliente || null,
                data_hora: admin.firestore.FieldValue.serverTimestamp(),
                tipo_pedido: String(tipo_pedido),
                status: String(status),
                valor_desconto: Number(parseFloat(Number.isNaN(valor_desconto) ? 0.0 : valor_desconto)),
                valor_total: Number(parseFloat(valorTotalCalculado)),
                pagamento: {
                    forma_pagamento: String(forma_pagamento),
                    status: String(status_pagamento)
                },
                itens: itensFormatados
            };

            transaction.set(novoPedidoRef, pedidoDoc);

            return {
                id: novoPedidoRef.id,
                ...pedidoDoc,
                fidelidade_resultado: infoFidelidade
            };
        });

        return res.status(201).json(resultado);
    } catch (error) {
        console.error('[POST /api/pedidos] Erro na transação ACID:', error.message);
        return res.status(400).json({ error: error.message || 'Erro ao processar pedido.' });
    }
});

module.exports = router;
