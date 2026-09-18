const clientesService = require("../services/clientesService");

async function buscarPorCpf(req, res, next) {
    try {
        const { cpf } = req.params;
        const cliente = await clientesService.buscarPorCpf(cpf);
        res.status(200).json({ sucesso: true, dados: cliente });
    } catch (error) {
        next(error);
    }
}

async function cadastrar(req, res, next) {
    try {
        const novoCliente = await clientesService.cadastrarCliente(req.body);
        res.status(201).json({ sucesso: true, dados: novoCliente });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    buscarPorCpf,
    cadastrar
};
