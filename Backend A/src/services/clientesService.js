/**
 * Serviço de Gestão de Clientes e Fidelidade (RF01 e RF06)
 */

const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

async function buscarPorCpf(cpf) {
    const limpo = cpf.replace(/\D/g, "");
    const snapshot = await db.collection("clientes").where("cpf", "==", limpo).limit(1).get();

    if (snapshot.empty) {
        const error = new Error(`Cliente com CPF "${cpf}" não encontrado.`);
        error.statusCode = 404;
        throw error;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
}

async function cadastrarCliente(dados) {
    const { nome, cpf, telefone } = dados;

    if (!nome || !cpf) {
        const error = new Error("Campos obrigatórios ausentes: nome e cpf.");
        error.statusCode = 400;
        throw error;
    }

    const cpfLimpo = cpf.replace(/\D/g, "");

    // Verifica se já existe
    const existe = await db.collection("clientes").where("cpf", "==", cpfLimpo).limit(1).get();
    if (!existe.empty) {
        const error = new Error("Já existe um cliente cadastrado com este CPF.");
        error.statusCode = 409;
        throw error;
    }

    const novoCliente = {
        nome,
        cpf: cpfLimpo,
        telefone: telefone || "",
        fidelidade: {
            quantidade_compras_validas: 0,
            elegivel_premio: false
        },
        criadoEm: FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("clientes").add(novoCliente);
    return { id: docRef.id, ...novoCliente };
}

module.exports = {
    buscarPorCpf,
    cadastrarCliente
};
