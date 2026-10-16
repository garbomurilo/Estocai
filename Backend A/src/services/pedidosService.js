/**
 * Serviço de Pedidos e Vendas (Regras de Negócio e Transações Atômicas)
 * Multi-Tenancy Estrito: Todos os pedidos residem isoladamente em /tenants/{tenantId}/pedidos
 */

const { db, hasCredentials } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

// Memória local de pedidos para desenvolvimento sem credenciais
const devPedidosMemory = {};

function getTenantCol(tenantId, subcol) {
    if (!tenantId) {
        const error = new Error("Tenant não identificado para operação de pedidos.");
        error.statusCode = 400;
        throw error;
    }
    return db.collection("tenants").doc(tenantId).collection(subcol);
}

async function fecharPedidoComBaixaEstoque(tenantId, dadosVenda) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    const { itens, clienteId, formaPagamento = "DINHEIRO", desconto = 0, operadorId } = dadosVenda;

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        const error = new Error("O carrinho de compras está vazio ou é inválido.");
        error.statusCode = 400;
        throw error;
    }

    // Em dev sem credenciais, simula o fechamento do pedido e armazena na memória do tenant
    if (!hasCredentials) {
        if (!devPedidosMemory[tenantId]) devPedidosMemory[tenantId] = [];
        let subtotal = 0;
        const itensProcessados = itens.map(item => {
            const qtd = Number(item.quantidade) || 1;
            const preco = Number(item.preco) || 0;
            subtotal += preco * qtd;
            return {
                id: item.id,
                nome: item.nome,
                quantidade: qtd,
                preco_unitario: preco,
                subtotal: preco * qtd
            };
        });
        const valorTotalFinal = Math.max(0, subtotal - Number(desconto));
        const pedidoId = "dev_ped_" + Date.now();
        const novoPedido = {
            id: pedidoId,
            tenantId,
            data_hora: new Date().toISOString(),
            operador_id: operadorId || "operador-pdv",
            cliente_id: clienteId || null,
            forma_pagamento: formaPagamento,
            subtotal,
            desconto: Number(desconto),
            valor_total: valorTotalFinal,
            status: "CONCLUIDO",
            itens: itensProcessados
        };
        devPedidosMemory[tenantId].unshift(novoPedido);
        return {
            sucesso: true,
            pedidoId,
            valorTotal: valorTotalFinal,
            subtotal,
            desconto: Number(desconto),
            itensProcessados: itensProcessados.length
        };
    }

    return await db.runTransaction(async (transaction) => {
        const produtosParaAtualizar = [];
        let subtotalCalculado = 0;

        // 1. Fase de Leitura estritamente dentro de tenants/{tenantId}/produtos
        for (const item of itens) {
            const produtoRef = getTenantCol(tenantId, "produtos").doc(item.id);
            const produtoSnap = await transaction.get(produtoRef);

            if (!produtoSnap.exists) {
                const error = new Error(`Produto não localizado na base de dados do negócio ${tenantId}: ${item.nome || item.id}`);
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
                error.statusCode = 409;
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

        let clienteRef = null;
        let clienteSnap = null;
        if (clienteId) {
            clienteRef = getTenantCol(tenantId, "clientes").doc(clienteId);
            clienteSnap = await transaction.get(clienteRef);
        }

        // 2. Fase de Escrita: dedução atômica no estoque do tenant
        for (const p of produtosParaAtualizar) {
            transaction.update(p.ref, {
                estoque: p.novoEstoque,
                atualizadoEm: FieldValue.serverTimestamp()
            });
        }

        const valorTotalFinal = Math.max(0, subtotalCalculado - Number(desconto));

        // 3. Persistência do Pedido em tenants/{tenantId}/pedidos
        const novoPedidoRef = getTenantCol(tenantId, "pedidos").doc();

        const registroPedido = {
            id: novoPedidoRef.id,
            tenantId,
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

        // 4. Bonificação de Fidelidade dentro do tenant
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

async function cancelarPedidoEStornar(tenantId, pedidoId, operadorId) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        const lista = devPedidosMemory[tenantId] || [];
        const ped = lista.find(p => p.id === pedidoId);
        if (ped) {
            ped.status = "CANCELADO";
            return { sucesso: true, pedidoId, status: "CANCELADO" };
        }
        const error = new Error(`Pedido "${pedidoId}" não encontrado no negócio ${tenantId}.`);
        error.statusCode = 404;
        throw error;
    }

    const pedidoRef = getTenantCol(tenantId, "pedidos").doc(pedidoId);

    return await db.runTransaction(async (transaction) => {
        const pedidoSnap = await transaction.get(pedidoRef);

        if (!pedidoSnap.exists) {
            const error = new Error(`Pedido "${pedidoId}" não encontrado no negócio ${tenantId}.`);
            error.statusCode = 404;
            throw error;
        }

        const pedidoData = pedidoSnap.data();

        if (pedidoData.status === "CANCELADO") {
            const error = new Error("Este pedido já se encontra cancelado.");
            error.statusCode = 400;
            throw error;
        }

        for (const item of pedidoData.itens || []) {
            const produtoRef = getTenantCol(tenantId, "produtos").doc(item.id);
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

async function listarPedidos(tenantId, limite = 20) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        return (devPedidosMemory[tenantId] || []).slice(0, Number(limite));
    }

    const ref = getTenantCol(tenantId, "pedidos");
    const snapshot = await ref
        .orderBy("data_hora", "desc")
        .limit(Number(limite))
        .get();

    const pedidos = [];
    snapshot.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));
    return pedidos;
}

async function obterPedidoPorId(tenantId, pedidoId) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        const lista = devPedidosMemory[tenantId] || [];
        const pedido = lista.find(p => p.id === pedidoId);
        if (!pedido) {
            const error = new Error(`Pedido "${pedidoId}" não encontrado.`);
            error.statusCode = 404;
            throw error;
        }
        return pedido;
    }

    const snap = await getTenantCol(tenantId, "pedidos").doc(pedidoId).get();

    if (!snap.exists) {
        const error = new Error(`Pedido com ID "${pedidoId}" não encontrado no negócio ${tenantId}.`);
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
