/**
 * Serviço de Gerenciamento e Controle de Estoque
 * Trata o estorno de mercadorias em cancelamentos e alertas de reposição.
 */

const { FieldValue } = require("firebase-admin/firestore");

/**
 * Estorna os itens de um pedido cancelado de volta para o estoque disponível.
 * 
 * @param {FirebaseFirestore.Firestore} db Instância do Firestore
 * @param {string} pedidoId ID do pedido a ser cancelado
 * @param {string} operadorId ID do operador que solicitou o cancelamento
 * @returns {Promise<Object>}
 */
async function cancelarPedidoEStornarEstoque(db, pedidoId, operadorId) {
    if (!pedidoId) {
        throw new Error("Identificador do pedido é obrigatório para cancelamento.");
    }

    const pedidoRef = db.collection("pedidos").doc(pedidoId);

    return await db.runTransaction(async (transaction) => {
        const pedidoSnap = await transaction.get(pedidoRef);

        if (!pedidoSnap.exists) {
            throw new Error(`Pedido com ID "${pedidoId}" não foi encontrado.`);
        }

        const pedidoData = pedidoSnap.data();

        if (pedidoData.status === "CANCELADO") {
            throw new Error("Este pedido já foi cancelado anteriormente.");
        }

        // Estorno dos itens
        for (const item of pedidoData.itens || []) {
            const produtoRef = db.collection("produtos").doc(item.id);
            const produtoSnap = await transaction.get(produtoRef);

            if (produtoSnap.exists) {
                const estoqueAtual = Number(produtoSnap.data().estoque) || 0;
                const quantidadeEstornada = Number(item.quantidade) || 0;
                transaction.update(produtoRef, {
                    estoque: estoqueAtual + quantidadeEstornada,
                    atualizadoEm: FieldValue.serverTimestamp()
                });
            }
        }

        // Marca status do pedido como cancelado
        transaction.update(pedidoRef, {
            status: "CANCELADO",
            cancelado_em: FieldValue.serverTimestamp(),
            cancelado_por: operadorId || "sistema"
        });

        return {
            sucesso: true,
            pedidoId,
            mensagem: "Pedido cancelado e itens estornados ao estoque com sucesso."
        };
    });
}

/**
 * Avalia se o estoque atingiu o nível crítico e gera log/alerta de reposição.
 * 
 * @param {Object} produtoAntes Dados do produto antes da alteração
 * @param {Object} produtoDepois Dados do produto após a alteração
 * @param {string} produtoId ID do produto
 */
function avaliarNivelCriticoEstoque(produtoAntes, produtoDepois, produtoId) {
    const estoqueAntes = Number(produtoAntes?.estoque) || 0;
    const estoqueDepois = Number(produtoDepois?.estoque) || 0;
    const nome = produtoDepois?.nome || produtoId;
    const limiteCritico = Number(produtoDepois?.limite_minimo) || 5;

    if (estoqueDepois <= limiteCritico && estoqueAntes > limiteCritico) {
        console.warn(
            `[ALERTA DE ESTOQUE CRÍTICO] Produto: "${nome}" (ID: ${produtoId}) atingiu ${estoqueDepois} unidades. Necessária reposição!`
        );
        return { alertaEmitido: true, produtoId, nome, estoqueAtual: estoqueDepois };
    }

    return { alertaEmitido: false };
}

module.exports = {
    cancelarPedidoEStornarEstoque,
    avaliarNivelCriticoEstoque
};
