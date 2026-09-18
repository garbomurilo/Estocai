/**
 * Entrada Principal da Camada de Backend Serverless (Firebase Cloud Functions)
 * Sistema de Gestão Estocaí - FATEC Sorocaba (ADS 2026/2)
 * 
 * Desenvolvido para centralizar regras de negócio críticas e ACID transactions.
 */

const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const functions = require("firebase-functions");

// Inicialização segura do Firebase Admin SDK
if (!getApps().length) {
    initializeApp();
}

const db = getFirestore();

// Importação dos serviços desacoplados
const { processarFechamentoVenda } = require("./services/vendasService");
const { cancelarPedidoEStornarEstoque, avaliarNivelCriticoEstoque } = require("./services/estoqueService");

/**
 * 1. Cloud Function Callable: finalizarVenda
 * Endpoint seguro chamado pelo front-end para concluir uma comanda/venda.
 * Executa transação ACID no servidor: validação de estoque, baixa atômica e criação do pedido.
 */
exports.finalizarVenda = functions
    .region("southamerica-east1") // São Paulo (baixa latência para o cliente no Brasil)
    .https.onCall(async (data, context) => {
        // Validação de autenticação
        if (!context.auth) {
            throw new functions.https.HttpsError(
                "unauthenticated",
                "Apenas operadores autenticados podem registrar e finalizar vendas no sistema."
            );
        }

        try {
            const operadorId = context.auth.uid;
            const resultado = await processarFechamentoVenda(db, {
                itens: data.itens,
                clienteId: data.clienteId,
                formaPagamento: data.formaPagamento,
                desconto: data.desconto,
                operadorId
            });

            return resultado;
        } catch (error) {
            console.error("Falha ao processar venda no servidor:", error);
            throw new functions.https.HttpsError(
                "invalid-argument",
                error.message || "Erro interno ao processar transação de venda."
            );
        }
    });

/**
 * 2. Cloud Function Callable: cancelarPedido
 * Cancela um pedido existente e estorna as quantidades dos produtos para o estoque.
 */
exports.cancelarPedido = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError(
                "unauthenticated",
                "Acesso restrito a usuários autenticados."
            );
        }

        try {
            const { pedidoId } = data;
            const operadorId = context.auth.uid;
            const resultado = await cancelarPedidoEStornarEstoque(db, pedidoId, operadorId);
            return resultado;
        } catch (error) {
            console.error("Falha ao cancelar pedido:", error);
            throw new functions.https.HttpsError(
                "aborted",
                error.message || "Erro ao estornar pedido."
            );
        }
    });

/**
 * 3. Cloud Function Trigger (Orientada a Eventos): monitorarEstoque
 * Disparada automaticamente sempre que houver alteração em um documento de produto.
 * Emite logs e alertas quando o estoque atingir níveis críticos de reposição.
 */
exports.monitorarEstoque = functions
    .region("southamerica-east1")
    .firestore.document("produtos/{produtoId}")
    .onWrite((change, context) => {
        const produtoAntes = change.before.exists ? change.before.data() : null;
        const produtoDepois = change.after.exists ? change.after.data() : null;
        const produtoId = context.params.produtoId;

        // Se o produto foi excluído, encerra
        if (!produtoDepois) return null;

        return avaliarNivelCriticoEstoque(produtoAntes, produtoDepois, produtoId);
    });

/**
 * 4. Endpoint HTTPS Simples (Health Check)
 * Para verificação de status e testes de conectividade da camada de backend.
 */
exports.healthCheck = functions
    .region("southamerica-east1")
    .https.onRequest((req, res) => {
        res.status(200).json({
            status: "online",
            sistema: "Estocaí Backend Serverless",
            ambiente: process.env.NODE_ENV || "desenvolvimento",
            timestamp: new Date().toISOString()
        });
    });
