const produtosService = require("../services/produtosService");

async function listar(req, res, next) {
    try {
        const { tipo } = req.query;
        const tenantId = req.tenantId;
        const produtos = await produtosService.listarProdutos(tenantId, tipo);
        res.status(200).json({ sucesso: true, dados: produtos });
    } catch (error) {
        next(error);
    }
}

async function listarPublico(req, res, next) {
    try {
        const { tenantId } = req.params; // Vem da URL em vez do token
        const produtos = await produtosService.listarProdutos(tenantId, "DIA"); // Cardápio só mostra estoque do DIA
        res.status(200).json({ sucesso: true, dados: produtos });
    } catch (error) {
        next(error);
    }
}

async function buscarPorId(req, res, next) {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        const produto = await produtosService.obterProdutoPorId(tenantId, id);
        res.status(200).json({ sucesso: true, dados: produto });
    } catch (error) {
        next(error);
    }
}

async function criar(req, res, next) {
    try {
        const tenantId = req.tenantId;
        const novoProduto = await produtosService.criarProduto(tenantId, req.body);
        res.status(201).json({ sucesso: true, dados: novoProduto });
    } catch (error) {
        next(error);
    }
}

async function atualizar(req, res, next) {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        const atualizado = await produtosService.atualizarProduto(tenantId, id, req.body);
        res.status(200).json({ sucesso: true, dados: atualizado });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listar,
    listarPublico,
    buscarPorId,
    criar,
    atualizar
};
