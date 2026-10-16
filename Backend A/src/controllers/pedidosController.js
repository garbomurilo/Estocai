const pedidosService = require("../services/pedidosService");

async function fechar(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const dadosVenda = {
            ...req.body,
            operadorId: req.user?.uid || req.body.operadorId || "operador-pdv"
        };
        const resultado = await pedidosService.fecharPedidoComBaixaEstoque(tenantId, dadosVenda);
        res.status(201).json({
            sucesso: true,
            mensagem: "Venda finalizada e baixa de estoque executada com sucesso.",
            dados: resultado
        });
    } catch (error) {
        next(error);
    }
}

async function listar(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const { limite } = req.query;
        const pedidos = await pedidosService.listarPedidos(tenantId, limite);
        res.status(200).json({ sucesso: true, dados: pedidos });
    } catch (error) {
        next(error);
    }
}

async function buscarPorId(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        const pedido = await pedidosService.obterPedidoPorId(tenantId, id);
        res.status(200).json({ sucesso: true, dados: pedido });
    } catch (error) {
        next(error);
    }
}

async function cancelar(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        const operadorId = req.user?.uid || "operador-pdv";
        const resultado = await pedidosService.cancelarPedidoEStornar(tenantId, id, operadorId);
        res.status(200).json({ sucesso: true, dados: resultado });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    fechar,
    listar,
    buscarPorId,
    cancelar
};
