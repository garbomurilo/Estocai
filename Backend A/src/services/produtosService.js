/**
 * Serviço de Catálogo de Produtos e Insumos (Regras de Negócio)
 */

const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

async function listarProdutos(filtroTipo = null) {
    let query = db.collection("produtos");

    if (filtroTipo) {
        query = query.where("tipo_estoque", "==", filtroTipo);
    }

    const snapshot = await query.get();
    const produtos = [];

    snapshot.forEach(doc => {
        produtos.push({
            id: doc.id,
            ...doc.data()
        });
    });

    return produtos;
}

async function obterProdutoPorId(id) {
    const docSnap = await db.collection("produtos").doc(id).get();
    if (!docSnap.exists) {
        const error = new Error(`Produto com ID "${id}" não encontrado.`);
        error.statusCode = 404;
        throw error;
    }
    return { id: docSnap.id, ...docSnap.data() };
}

async function criarProduto(dados) {
    const { nome, preco, estoque, tipo_estoque = "DIA", categoria = "Geral", unidade = "un" } = dados;

    if (!nome || preco === undefined || estoque === undefined) {
        const error = new Error("Campos obrigatórios ausentes: nome, preco e estoque.");
        error.statusCode = 400;
        throw error;
    }

    const novoProduto = {
        nome,
        preco: Number(preco),
        estoque: Number(estoque),
        tipo_estoque,
        categoria,
        unidade,
        ativo: true,
        criadoEm: FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("produtos").add(novoProduto);
    return { id: docRef.id, ...novoProduto };
}

async function atualizarProduto(id, dados) {
    const docRef = db.collection("produtos").doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
        const error = new Error(`Produto com ID "${id}" não encontrado.`);
        error.statusCode = 404;
        throw error;
    }

    const atualizacao = {
        ...dados,
        atualizadoEm: FieldValue.serverTimestamp()
    };

    if (dados.preco !== undefined) atualizacao.preco = Number(dados.preco);
    if (dados.estoque !== undefined) atualizacao.estoque = Number(dados.estoque);

    await docRef.update(atualizacao);
    return { id, ...snap.data(), ...atualizacao };
}

module.exports = {
    listarProdutos,
    obterProdutoPorId,
    criarProduto,
    atualizarProduto
};
