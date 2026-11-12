/**
 * api.js — Camada centralizada de comunicação HTTP (REST API) do Front-end React.
 * O Front-end atua estritamente como camada de apresentação e consome as rotas /api/... do Express.
 */
import { auth } from "../firebase";

const API_BASE_URL =
    typeof window !== "undefined" && window.location.port && window.location.port !== "3000"
        ? "http://localhost:3000"
        : "";

/**
 * Executa uma requisição HTTP autenticada enviando o idToken JWT no header Authorization.
 */
export async function apiRequest(endpoint, options = {}) {
    const user = auth.currentUser;
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (user) {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
        method: options.method || "GET",
        headers
    };

    if (options.body !== undefined) {
        config.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    return data;
}

export const AuthAPI = {
    login: (idToken) => apiRequest("/api/auth/login", { method: "POST", body: { idToken } }),
    register: (dados) => apiRequest("/api/auth/register", { method: "POST", body: dados }),
    me: () => apiRequest("/api/auth/me")
};

export const ProdutosAPI = {
    listar: () => apiRequest("/api/produtos"),
    buscarPorId: (id) => apiRequest(`/api/produtos/${id}`),
    criar: (dados) => apiRequest("/api/produtos", { method: "POST", body: dados }),
    atualizar: (id, dados) => apiRequest(`/api/produtos/${id}`, { method: "PUT", body: dados }),
    excluir: (id) => apiRequest(`/api/produtos/${id}`, { method: "DELETE" }),
    produzirLote: (produtoId, quantidadeLote) =>
        apiRequest("/api/produtos/produzir", {
            method: "POST",
            body: { produtoId, quantidadeLote }
        })
};

export const ClientesAPI = {
    listar: () => apiRequest("/api/clientes"),
    buscarPorId: (id) => apiRequest(`/api/clientes/${id}`),
    criar: (dados) => apiRequest("/api/clientes", { method: "POST", body: dados }),
    atualizar: (id, dados) => apiRequest(`/api/clientes/${id}`, { method: "PUT", body: dados }),
    excluir: (id) => apiRequest(`/api/clientes/${id}`, { method: "DELETE" }),
    registrarCompra: (id) => apiRequest(`/api/clientes/${id}/compra`, { method: "POST" }),
    resgatarPremio: (id) => apiRequest(`/api/clientes/${id}/resgatar`, { method: "POST" })
};

export const PedidosAPI = {
    listar: () => apiRequest("/api/pedidos"),
    criar: (dados) => apiRequest("/api/pedidos", { method: "POST", body: dados })
};

export const ExpedienteAPI = {
    statusAtual: () => apiRequest("/api/expediente/atual"),
    iniciar: (valorInicial) =>
        apiRequest("/api/expediente/iniciar", { method: "POST", body: { valorInicial } }),
    encerrar: (dadosFechamento) =>
        apiRequest("/api/expediente/encerrar", { method: "POST", body: dadosFechamento })
};

export const ConfiguracoesAPI = {
    obterFidelidade: () => apiRequest("/api/configuracoes/fidelidade"),
    salvarFidelidade: (dados) =>
        apiRequest("/api/configuracoes/fidelidade", { method: "PUT", body: dados }),
    obterEstoque: () => apiRequest("/api/configuracoes/estoque"),
    salvarEstoque: (limiar_estoque_minimo) =>
        apiRequest("/api/configuracoes/estoque", {
            method: "PUT",
            body: { limiar_estoque_minimo }
        })
};

