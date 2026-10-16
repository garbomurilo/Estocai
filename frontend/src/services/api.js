/**
 * api.js — Cliente HTTP centralizado para a API REST do Estocaí
 * Todas as chamadas ao backend passam por aqui.
 * O token do Firebase é injetado automaticamente no header Authorization.
 */

const BASE_URL = "http://localhost:3000/api";

/**
 * Obtém o token de autenticação atual do Firebase.
 * auth deve ser passado como argumento para evitar import circular.
 */
async function getAuthToken(auth) {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
}

/**
 * Requisição autenticada genérica
 */
async function request(auth, method, path, body = null) {
    const token = await getAuthToken(auth);
    const tenantId = localStorage.getItem('estocai_tenantId') || 'brasinha';
    const headers = { 
        "Content-Type": "application/json",
        "X-Tenant-ID": tenantId
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.erro || `Erro ${response.status} na requisição.`);
    }

    return data.dados;
}

// ─────────────────────────────────────────────
// PRODUTOS
// ─────────────────────────────────────────────

export const ProdutosAPI = {
    listar: (auth, tipo = null) =>
        request(auth, "GET", tipo ? `/produtos?tipo=${tipo}` : "/produtos"),

    buscarPorId: (auth, id) =>
        request(auth, "GET", `/produtos/${id}`),

    criar: (auth, dados) =>
        request(auth, "POST", "/produtos", dados),

    atualizar: (auth, id, dados) =>
        request(auth, "PUT", `/produtos/${id}`, dados),

    /** Rota pública — sem token (cardápio digital) */
    listarCardapio: async (tenantId) => {
        const response = await fetch(`${BASE_URL}/produtos/public/${tenantId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Erro ao carregar cardápio.");
        return data.dados;
    },
};

// ─────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────

export const PedidosAPI = {
    fechar: (auth, dadosVenda) =>
        request(auth, "POST", "/pedidos/fechar", dadosVenda),

    listar: (auth, limite = 20) =>
        request(auth, "GET", `/pedidos?limite=${limite}`),

    buscarPorId: (auth, id) =>
        request(auth, "GET", `/pedidos/${id}`),

    cancelar: (auth, id) =>
        request(auth, "POST", `/pedidos/${id}/cancelar`),
};

// ─────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────

export const ClientesAPI = {
    buscarPorCpf: (auth, cpf) =>
        request(auth, "GET", `/clientes/${cpf}`),

    criar: (auth, dados) =>
        request(auth, "POST", "/clientes", dados),
};
