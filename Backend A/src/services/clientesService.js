/**
 * Serviço de Gestão de Clientes e Fidelidade (RF01 e RF06)
 * Multi-Tenancy Estrito: Todos os clientes residem isoladamente em /tenants/{tenantId}/clientes
 */

const { db, hasCredentials } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

// Memória local de clientes por tenant para desenvolvimento
const devClientesMemory = {};

function getClientesRef(tenantId) {
    if (!tenantId) {
        const error = new Error("Tenant não identificado para operação de clientes.");
        error.statusCode = 400;
        throw error;
    }
    return db.collection("tenants").doc(tenantId).collection("clientes");
}

async function buscarPorCpf(tenantId, cpf) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    const limpo = cpf.replace(/\D/g, "");

    if (!hasCredentials) {
        const lista = devClientesMemory[tenantId] || [];
        const cliente = lista.find(c => c.cpf === limpo);
        if (!cliente) {
            const error = new Error(`Cliente com CPF "${cpf}" não encontrado no negócio ${tenantId}.`);
            error.statusCode = 404;
            throw error;
        }
        return cliente;
    }

    const ref = getClientesRef(tenantId);
    const snapshot = await ref.where("cpf", "==", limpo).limit(1).get();

    if (snapshot.empty) {
        const error = new Error(`Cliente com CPF "${cpf}" não encontrado no negócio ${tenantId}.`);
        error.statusCode = 404;
        throw error;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
}

async function cadastrarCliente(tenantId, dados) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    const { nome, cpf, telefone } = dados;

    if (!nome || !cpf) {
        const error = new Error("Campos obrigatórios ausentes: nome e cpf.");
        error.statusCode = 400;
        throw error;
    }

    const cpfLimpo = cpf.replace(/\D/g, "");

    if (!hasCredentials) {
        if (!devClientesMemory[tenantId]) devClientesMemory[tenantId] = [];
        const existe = devClientesMemory[tenantId].find(c => c.cpf === cpfLimpo);
        if (existe) {
            const error = new Error("Já existe um cliente cadastrado com este CPF.");
            error.statusCode = 409;
            throw error;
        }
        const novo = {
            id: "dev_cli_" + Date.now(),
            tenantId,
            nome,
            cpf: cpfLimpo,
            telefone: telefone || "",
            fidelidade: {
                quantidade_compras_validas: 0,
                elegivel_premio: false
            },
            criadoEm: new Date().toISOString()
        };
        devClientesMemory[tenantId].push(novo);
        return novo;
    }

    const ref = getClientesRef(tenantId);

    // Verifica se já existe dentro do tenant
    const existe = await ref.where("cpf", "==", cpfLimpo).limit(1).get();
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

    const docRef = await ref.add(novoCliente);
    return { id: docRef.id, ...novoCliente };
}

module.exports = {
    buscarPorCpf,
    cadastrarCliente
};
