/**
 * Serviço de Catálogo de Produtos e Insumos (Regras de Negócio)
 * Multi-Tenancy Estrito: Todos os dados residem isoladamente em /tenants/{tenantId}/produtos
 */

const { db, hasCredentials } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const https = require("https");

function getProdutosCollectionRef(tenantId) {
    if (!tenantId) {
        const error = new Error("Identificador do negócio (tenantId) é obrigatório.");
        error.statusCode = 400;
        throw error;
    }
    return db.collection("tenants").doc(tenantId).collection("produtos");
}

// Armazenamento em memória por tenant para desenvolvimento local sem credenciais
const devTenantsMemory = {};

/**
 * Fallback de leitura via REST API pública do Firestore para ambiente de desenvolvimento local
 */
async function fetchCatalogoInicialViaRest() {
    const projectId = process.env.FIREBASE_PROJECT_ID || "brasiinha";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/produtos`;

    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    const prods = (json.documents || []).map(doc => {
                        const id = doc.name.split("/").pop();
                        const fields = doc.fields || {};
                        const obj = { id };
                        for (const [k, v] of Object.entries(fields)) {
                            if ("stringValue" in v) obj[k] = v.stringValue;
                            else if ("integerValue" in v) obj[k] = Number(v.integerValue);
                            else if ("doubleValue" in v) obj[k] = Number(v.doubleValue);
                            else if ("booleanValue" in v) obj[k] = v.booleanValue;
                            else if ("arrayValue" in v) obj[k] = (v.arrayValue?.values || []).map(x => Object.values(x)[0]);
                        }
                        return obj;
                    });
                    resolve(prods);
                } catch {
                    resolve([]);
                }
            });
        }).on("error", () => resolve([]));
    });
}

/**
 * Migra dados legados da raiz para o tenant no Firestore caso ainda não tenham sido migrados
 */
async function garantirMigracaoTenant(tenantId) {
    if (!hasCredentials) return;
    try {
        const tenantRef = db.collection("tenants").doc(tenantId).collection("produtos");
        const tenantSnap = await tenantRef.limit(1).get();

        if (tenantSnap.empty && tenantId === "brasinha") {
            const raizSnap = await db.collection("produtos").get();
            if (!raizSnap.empty) {
                console.log(`[Multi-Tenant] Migrando ${raizSnap.size} produtos legados para tenants/${tenantId}/produtos...`);
                const batch = db.batch();
                raizSnap.forEach(doc => {
                    const novoDocRef = tenantRef.doc(doc.id);
                    batch.set(novoDocRef, doc.data());
                });
                await batch.commit();
                console.log(`[Multi-Tenant] Migração para tenants/${tenantId}/produtos concluída com sucesso!`);
            }
        }
    } catch (err) {
        console.error("[Multi-Tenant] Aviso na sincronização do tenant:", err.message);
    }
}

async function listarProdutos(tenantId, filtroTipo = null) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        if (!devTenantsMemory[tenantId]) {
            if (tenantId === "brasinha") {
                devTenantsMemory[tenantId] = await fetchCatalogoInicialViaRest();
            } else {
                devTenantsMemory[tenantId] = [];
            }
        }
        let lista = devTenantsMemory[tenantId];
        if (filtroTipo) {
            lista = lista.filter(p => p.tipo_estoque === filtroTipo);
        }
        return lista;
    }

    await garantirMigracaoTenant(tenantId);

    const ref = getProdutosCollectionRef(tenantId);
    let query = ref;

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

async function obterProdutoPorId(tenantId, id) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        const lista = devTenantsMemory[tenantId] || [];
        const produto = lista.find(p => p.id === id);
        if (!produto) {
            const error = new Error(`Produto "${id}" não encontrado no negócio ${tenantId}.`);
            error.statusCode = 404;
            throw error;
        }
        return produto;
    }

    const ref = getProdutosCollectionRef(tenantId);
    const docSnap = await ref.doc(id).get();

    if (!docSnap.exists) {
        const error = new Error(`Produto "${id}" não encontrado no negócio ${tenantId}.`);
        error.statusCode = 404;
        throw error;
    }
    return { id: docSnap.id, ...docSnap.data() };
}

async function criarProduto(tenantId, dados) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

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
        criadoEm: hasCredentials ? FieldValue.serverTimestamp() : new Date().toISOString()
    };

    if (!hasCredentials) {
        if (!devTenantsMemory[tenantId]) devTenantsMemory[tenantId] = [];
        const id = "dev_" + Date.now();
        const criado = { id, ...novoProduto };
        devTenantsMemory[tenantId].push(criado);
        return criado;
    }

    const ref = getProdutosCollectionRef(tenantId);
    const docRef = await ref.add(novoProduto);
    return { id: docRef.id, ...novoProduto };
}

async function atualizarProduto(tenantId, id, dados) {
    if (!tenantId) {
        const error = new Error("Tenant não especificado.");
        error.statusCode = 400;
        throw error;
    }

    if (!hasCredentials) {
        const lista = devTenantsMemory[tenantId] || [];
        const index = lista.findIndex(p => p.id === id);
        if (index === -1) {
            const error = new Error(`Produto "${id}" não encontrado no negócio ${tenantId}.`);
            error.statusCode = 404;
            throw error;
        }
        const atualizado = { ...lista[index], ...dados };
        if (dados.preco !== undefined) atualizado.preco = Number(dados.preco);
        if (dados.estoque !== undefined) atualizado.estoque = Number(dados.estoque);
        lista[index] = atualizado;
        return atualizado;
    }

    const ref = getProdutosCollectionRef(tenantId);
    const docRef = ref.doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
        const error = new Error(`Produto "${id}" não encontrado no negócio ${tenantId}.`);
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
