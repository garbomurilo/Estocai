const produtosService = require("../services/produtosService");

async function listar(req, res, next) {
    try {
        const { tipo } = req.query;
        const produtos = await produtosService.listarProdutos(tipo);
        res.status(200).json({ sucesso: true, dados: produtos });
    } catch (error) {
        next(error);
    }
}

async function buscarPorId(req, res, next) {
    try {
        const { id } = req.params;
        const produto = await produtosService.obterProdutoPorId(id);
        res.status(200).json({ sucesso: true, dados: produto });
    } catch (error) {
        next(error);
    }
}

async function criar(req, res, next) {
    try {
        const novoProduto = await produtosService.criarProduto(req.body);
        res.status(201).json({ sucesso: true, dados: novoProduto });
    } catch (error) {
        next(error);
    }
}

async function atualizar(req, res, next) {
    try {
        const { id } = req.params;
        const atualizado = await produtosService.atualizarProduto(id, req.body);
        res.status(200).json({ sucesso: true, dados: atualizado });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar
};
