/**
 * Serviço de Pedidos e Vendas (Regras de Negócio e Transações Atômicas)
 * Executa baixas e estornos de estoque em transações ACID via Firebase Admin SDK.
 */

const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

/**
 * Fecha um pedido/venda executando a baixa atômica de estoque e gerando o registro final.
 */
async function fecharPedidoComBaixaEstoque(dadosVenda) {
    const { itens, clienteId, formaPagamento = "DINHEIRO", desconto = 0, operadorId } = dadosVenda;

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        const error = new Error("O carrinho de compras está vazio ou é inválido.");
        error.statusCode = 400;
        throw error;
    }

    return await db.runTransaction(async (transaction) => {
        const produtosParaAtualizar = [];
        let subtotalCalculado = 0;

        // 1. Fase de Leitura: validação de estoque de cada item no banco
        for (const item of itens) {
            const produtoRef = db.collection("produtos").doc(item.id);
            const produtoSnap = await transaction.get(produtoRef);

            if (!produtoSnap.exists) {
                const error = new Error(`Produto não localizado na base de dados: ${item.nome || item.id}`);
                error.statusCode = 404;
                throw error;
            }

            const produtoData = produtoSnap.data();

            if (!produtoData.ativo) {
                const error = new Error(`O produto "${produtoData.nome}" encontra-se inativo para venda.`);
                error.statusCode = 400;
                throw error;
            }

            const estoqueAtual = Number(produtoData.estoque) || 0;
            const qtdSolicitada = Number(item.quantidade) || 0;

            if (qtdSolicitada <= 0) {
                const error = new Error(`Quantidade inválida solicitada para "${produtoData.nome}".`);
                error.statusCode = 400;
                throw error;
            }

            if (estoqueAtual < qtdSolicitada) {
                const error = new Error(
                    `Estoque insuficiente para "${produtoData.nome}". Disponível: ${estoqueAtual}, Solicitado: ${qtdSolicitada}.`
                );
                error.statusCode = 409; // Conflito de concorrência/estoque
                throw error;
            }

            const precoUnitario = Number(produtoData.preco) || 0;
            subtotalCalculado += (precoUnitario * qtdSolicitada);

            produtosParaAtualizar.push({
                ref: produtoRef,
                nome: produtoData.nome,
                novoEstoque: estoqueAtual - qtdSolicitada,
                quantidadeVendida: qtdSolicitada,
                precoUnitario
            });
        }

        // Validação opcional de cliente para fidelidade (RF06)
        let clienteRef = null;
        let clienteSnap = null;
        if (clienteId) {
            clienteRef = db.collection("clientes").doc(clienteId);
            clienteSnap = await transaction.get(clienteRef);
        }

        // 2. Fase de Escrita: dedução atômica do estoque
        for (const p of produtosParaAtualizar) {
            transaction.update(p.ref, {
                estoque: p.novoEstoque,
                atualizadoEm: FieldValue.serverTimestamp()
            });
        }

        const valorTotalFinal = Math.max(0, subtotalCalculado - Number(desconto));

        // 3. Persistência do Pedido na coleção "pedidos"
        const novoPedidoRef = db.collection("pedidos").doc();
        const registroPedido = {
            id: novoPedidoRef.id,
            data_hora: FieldValue.serverTimestamp(),
            operador_id: operadorId || "operador-pdv",
            cliente_id: clienteId || null,
            forma_pagamento: formaPagamento,
            subtotal: subtotalCalculado,
            desconto: Number(desconto),
            valor_total: valorTotalFinal,
            status: "CONCLUIDO",
            itens: produtosParaAtualizar.map(p => ({
                id: p.ref.id,
                nome: p.nome,
                quantidade: p.quantidadeVendida,
                preco_unitario: p.precoUnitario,
                subtotal: p.precoUnitario * p.quantidadeVendida
            }))
        };

        transaction.set(novoPedidoRef, registroPedido);

        // 4. Bonificação de Fidelidade (RF06)
        if (clienteRef && clienteSnap && clienteSnap.exists) {
            const comprasAnteriores = Number(clienteSnap.data()?.fidelidade?.quantidade_compras_validas) || 0;
            const novaContagem = comprasAnteriores + 1;
            transaction.update(clienteRef, {
                "fidelidade.quantidade_compras_validas": novaContagem,
                "fidelidade.elegivel_premio": novaContagem >= 10,
                "fidelidade.ultima_compra": FieldValue.serverTimestamp()
            });
        }

        return {
            sucesso: true,
            pedidoId: novoPedidoRef.id,
            valorTotal: valorTotalFinal,
            subtotal: subtotalCalculado,
            desconto: Number(desconto),
            itensProcessados: produtosParaAtualizar.length
        };
    });
}

/**
 * Cancela um pedido e estorna os itens para o estoque de forma atômica.
 */
async function cancelarPedidoEStornar(pedidoId, operadorId) {
    const pedidoRef = db.collection("pedidos").doc(pedidoId);

    return await db.runTransaction(async (transaction) => {
        const pedidoSnap = await transaction.get(pedidoRef);

        if (!pedidoSnap.exists) {
            const error = new Error(`Pedido com ID "${pedidoId}" não encontrado.`);
            error.statusCode = 404;
            throw error;
        }

        const pedidoData = pedidoSnap.data();

        if (pedidoData.status === "CANCELADO") {
            const error = new Error("Este pedido já se encontra cancelado.");
            error.statusCode = 400;
            throw error;
        }

        // Estorna as quantidades ao estoque
        for (const item of pedidoData.itens || []) {
            const produtoRef = db.collection("produtos").doc(item.id);
            const produtoSnap = await transaction.get(produtoRef);

            if (produtoSnap.exists) {
                const estoqueAtual = Number(produtoSnap.data().estoque) || 0;
                transaction.update(produtoRef, {
                    estoque: estoqueAtual + Number(item.quantidade),
                    atualizadoEm: FieldValue.serverTimestamp()
                });
            }
        }

        transaction.update(pedidoRef, {
            status: "CANCELADO",
            cancelado_em: FieldValue.serverTimestamp(),
            cancelado_por: operadorId || "sistema"
        });

        return {
            sucesso: true,
            pedidoId,
            status: "CANCELADO",
            mensagem: "Pedido cancelado e insumos estornados ao estoque com sucesso."
        };
    });
}

async function listarPedidos(limite = 20) {
    const snapshot = await db.collection("pedidos")
        .orderBy("data_hora", "desc")
        .limit(Number(limite))
        .get();

    const pedidos = [];
    snapshot.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));
    return pedidos;
}

async function obterPedidoPorId(pedidoId) {
    const snap = await db.collection("pedidos").doc(pedidoId).get();
    if (!snap.exists) {
        const error = new Error(`Pedido com ID "${pedidoId}" não encontrado.`);
        error.statusCode = 404;
        throw error;
    }
    return { id: snap.id, ...snap.data() };
}

module.exports = {
    fecharPedidoComBaixaEstoque,
    cancelarPedidoEStornar,
    listarPedidos,
    obterPedidoPorId
};
