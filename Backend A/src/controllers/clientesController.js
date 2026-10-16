const clientesService = require("../services/clientesService");

async function buscarPorCpf(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const { cpf } = req.params;
        const cliente = await clientesService.buscarPorCpf(tenantId, cpf);
        res.status(200).json({ sucesso: true, dados: cliente });
    } catch (error) {
        next(error);
    }
}

async function criar(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const novoCliente = await clientesService.cadastrarCliente(tenantId, req.body);
        res.status(201).json({ sucesso: true, dados: novoCliente });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    buscarPorCpf,
    criar
};
