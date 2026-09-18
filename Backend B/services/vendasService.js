/**
 * Serviço de Vendas e Fechamento de Pedidos (Regras de Negócio Server-Side)
 * Garante atomicidade (Transações ACID) na dedução do estoque e registro de vendas.
 */

const { FieldValue } = require("firebase-admin/firestore");

/**
 * Processa a finalização de uma venda de forma atômica utilizando Firestore Transactions.
 * 
 * @param {FirebaseFirestore.Firestore} db Instância do Firestore Admin
 * @param {Object} dadosVenda Dados recebidos da requisição
 * @param {Array} dadosVenda.itens Lista de itens [{ id, nome, preco, quantidade }]
 * @param {string} [dadosVenda.clienteId] ID ou CPF do cliente para fidelidade
 * @param {string} dadosVenda.formaPagamento Forma de pagamento (DINHEIRO, PIX, CARTAO)
 * @param {number} [dadosVenda.desconto] Valor de desconto aplicado
 * @param {string} dadosVenda.operadorId UID do operador de caixa autenticado
 * @returns {Promise<Object>} Resultado da transação com o ID do pedido gerado
 */
async function processarFechamentoVenda(db, dadosVenda) {
    const { itens, clienteId, formaPagamento = "DINHEIRO", desconto = 0, operadorId } = dadosVenda;

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        throw new Error("O carrinho de compras está vazio ou é inválido.");
    }

    // Executa a transação atômica
    return await db.runTransaction(async (transaction) => {
        const produtosParaAtualizar = [];
        let subtotalCalculado = 0;

        // 1. Fase de Leituras da Transação (Validação de Estoque e Preço no Servidor)
        for (const item of itens) {
            const produtoRef = db.collection("produtos").doc(item.id);
            const produtoSnap = await transaction.get(produtoRef);

            if (!produtoSnap.exists) {
                throw new Error(`Produto não localizado na base de dados: ${item.nome || item.id}`);
            }

            const produtoData = produtoSnap.data();

            if (!produtoData.ativo) {
                throw new Error(`O produto "${produtoData.nome}" encontra-se inativo para venda.`);
            }

            const estoqueAtual = Number(produtoData.estoque) || 0;
            const qtdSolicitada = Number(item.quantidade) || 0;

            if (qtdSolicitada <= 0) {
                throw new Error(`Quantidade inválida para o produto "${produtoData.nome}".`);
            }

            if (estoqueAtual < qtdSolicitada) {
                throw new Error(
                    `Estoque insuficiente para "${produtoData.nome}". Disponível: ${estoqueAtual}, Solicitado: ${qtdSolicitada}.`
                );
            }

            const precoUnitario = Number(produtoData.preco) || 0;
            const subtotalItem = precoUnitario * qtdSolicitada;
            subtotalCalculado += subtotalItem;

            produtosParaAtualizar.push({
                ref: produtoRef,
                nome: produtoData.nome,
                novoEstoque: estoqueAtual - qtdSolicitada,
                quantidadeDeduzida: qtdSolicitada,
                precoUnitario
            });
        }

        // Validação de cliente (se informado para o programa de fidelidade - RF06)
        let clienteRef = null;
        let clienteSnap = null;
        if (clienteId) {
            clienteRef = db.collection("clientes").doc(clienteId);
            clienteSnap = await transaction.get(clienteRef);
        }

        // 2. Fase de Escritas da Transação (Dedução de estoque atômica)
        for (const item of produtosParaAtualizar) {
            transaction.update(item.ref, {
                estoque: item.novoEstoque,
                atualizadoEm: FieldValue.serverTimestamp()
            });
        }

        const valorTotalFinal = Math.max(0, subtotalCalculado - Number(desconto));

        // 3. Criação do documento oficial do pedido na coleção "pedidos"
        const novoPedidoRef = db.collection("pedidos").doc();
        const registroPedido = {
            id: novoPedidoRef.id,
            data_hora: FieldValue.serverTimestamp(),
            operador_id: operadorId || "sistema",
            cliente_id: clienteId || null,
            forma_pagamento: formaPagamento,
            subtotal: subtotalCalculado,
            desconto: Number(desconto),
            valor_total: valorTotalFinal,
            status: "CONCLUIDO",
            itens: produtosParaAtualizar.map(p => ({
                id: p.ref.id,
                nome: p.nome,
                quantidade: p.quantidadeDeduzida,
                preco_unitario: p.precoUnitario,
                subtotal: p.precoUnitario * p.quantidadeDeduzida
            }))
        };

        transaction.set(novoPedidoRef, registroPedido);

        // 4. Atualização de Fidelidade do Cliente (RF06)
        if (clienteRef && clienteSnap && clienteSnap.exists) {
            const comprasValidasAtuais = Number(clienteSnap.data()?.fidelidade?.quantidade_compras_validas) || 0;
            const novasComprasValidas = comprasValidasAtuais + 1;
            transaction.update(clienteRef, {
                "fidelidade.quantidade_compras_validas": novasComprasValidas,
                "fidelidade.elegivel_premio": novasComprasValidas >= 10,
                "fidelidade.ultima_compra": FieldValue.serverTimestamp()
            });
        }

        return {
            sucesso: true,
            pedidoId: novoPedidoRef.id,
            valorTotal: valorTotalFinal,
            quantidadeItens: produtosParaAtualizar.length,
            mensagem: "Venda finalizada e estoque deduzido com sucesso pelo servidor."
        };
    });
}

module.exports = {
    processarFechamentoVenda
};
