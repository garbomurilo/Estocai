import React, { useEffect, useState } from "react";
import { ProdutosAPI } from "../services/api";

/**
 * Exemplo de Componente React 19 consumindo exclusivamente a API REST do Express (/api/produtos).
 * Nenhum acesso direto ao Firestore é realizado no Front-end.
 */
export default function EstoqueModule({ usuario }) {
    const [produtos, setProdutos] = useState([]);
    const [abaAtiva, setAbaAtiva] = useState("DIA");
    const [selectedProdutoId, setSelectedProdutoId] = useState("");
    const [quantidadeLote, setQuantidadeLote] = useState(1);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState("");

    // Estados do Modal de Cadastro / Entrada de Lote (FEFO)
    const [modalAberto, setModalAberto] = useState(false);
    const [nome, setNome] = useState("");
    const [preco, setPreco] = useState("");
    const [estoque, setEstoque] = useState("");
    const [categoria, setCategoria] = useState("Geral");
    const [unidade, setUnidade] = useState("un");
    const [destinoEstoque, setDestinoEstoque] = useState("DIA");
    const [numeroLote, setNumeroLote] = useState("");
    const [dataValidade, setDataValidade] = useState("");
    const [receita, setReceita] = useState([]);

    const carregarProdutos = async () => {
        setCarregando(true);
        setErro("");
        try {
            const lista = await ProdutosAPI.listar();
            setProdutos(Array.isArray(lista) ? lista : []);

            const produtosDia = (Array.isArray(lista) ? lista : []).filter(
                (p) => p.tipo_estoque === "DIA"
            );
            if (produtosDia.length > 0 && !selectedProdutoId) {
                setSelectedProdutoId(produtosDia[0].id || produtosDia[0]._id);
            }
        } catch (err) {
            setErro(err.message || "Erro ao carregar estoque via API REST.");
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregarProdutos();
    }, []);

    const handleProduzirLote = async (e) => {
        e.preventDefault();
        if (!selectedProdutoId) {
            alert("Selecione um Produto Pronto (Estoque do Dia) para produzir.");
            return;
        }
        try {
            const resultado = await ProdutosAPI.produzirLote(
                selectedProdutoId,
                Number(quantidadeLote)
            );
            alert(resultado.message || "Lote produzido com sucesso!");
            await carregarProdutos();
        } catch (err) {
            alert(err.message || "Erro ao produzir lote.");
        }
    };

    const handleSalvarItem = async (e) => {
        e.preventDefault();
        try {
            await ProdutosAPI.criar({
                nome,
                preco: Number(preco) || 0,
                estoque: Number(estoque) || 0,
                categoria,
                unidade,
                tipo_estoque: destinoEstoque,
                numeroLote: destinoEstoque === "GERAL" ? numeroLote : undefined,
                validade: destinoEstoque === "GERAL" ? dataValidade : undefined,
                dataValidade: destinoEstoque === "GERAL" ? dataValidade : undefined,
                receita: destinoEstoque === "DIA" ? receita : [],
                ativo: true
            });
            setModalAberto(false);
            setNome("");
            setPreco("");
            setEstoque("");
            setNumeroLote("");
            setDataValidade("");
            await carregarProdutos();
        } catch (err) {
            alert(err.message || "Erro ao salvar item.");
        }
    };

    const produtosFiltrados = produtos.filter((p) => p.tipo_estoque === abaAtiva);
    const produtosDia = produtos.filter((p) => p.tipo_estoque === "DIA");
    const podeEditar =
        usuario?.cargo === "ADMIN" || usuario?.cargo === "ESTOQUISTA";

    return (
        <div className="space-y-6">
            {erro && (
                <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm font-bold border border-red-200">
                    {erro}
                </div>
            )}

            {modalAberto && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-gray-100">
                        <h3 className="text-2xl font-black text-orange-900 tracking-tight mb-6">
                            {destinoEstoque === "GERAL"
                                ? "Novo Insumo / Entrada de Lote"
                                : "Novo Item"}
                        </h3>
                        <form onSubmit={handleSalvarItem} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                    Nome do Item
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                        Preço / Custo (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={preco}
                                        onChange={(e) => setPreco(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                        {destinoEstoque === "GERAL"
                                            ? "QUANTIDADE DO LOTE *"
                                            : "ESTOQUE"}
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        min="0"
                                        value={estoque}
                                        onChange={(e) => setEstoque(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                        Categoria
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={categoria}
                                        onChange={(e) => setCategoria(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                        Unidade
                                    </label>
                                    <select
                                        value={unidade}
                                        onChange={(e) => setUnidade(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                                    >
                                        <option value="un">Unidade (un)</option>
                                        <option value="kg">Quilo (kg)</option>
                                        <option value="g">Grama (g)</option>
                                        <option value="L">Litro (L)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                    Destino (Estoque)
                                </label>
                                <select
                                    value={destinoEstoque}
                                    onChange={(e) => setDestinoEstoque(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-orange-50 border border-orange-100 font-bold text-orange-700"
                                >
                                    <option value="DIA">Vendas (Dia) - Aparece no PDV</option>
                                    <option value="GERAL">Matéria-Prima (Geral)</option>
                                </select>
                            </div>

                            {destinoEstoque === "GERAL" ? (
                                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-blue-900 uppercase tracking-wider">
                                            CONTROLE DE LOTE E VALIDADE (FEFO)
                                        </span>
                                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                                            Estoque Geral
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block mb-1">
                                                NÚMERO DO LOTE *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ex: LOTE-2026-01"
                                                value={numeroLote}
                                                onChange={(e) => setNumeroLote(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-blue-200 text-xs font-bold text-gray-800"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block mb-1">
                                                DATA DE VALIDADE *
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={dataValidade}
                                                onChange={(e) => setDataValidade(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-blue-200 text-xs font-bold text-gray-800"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-orange-900 uppercase tracking-wider">
                                            Ficha Técnica / Receita (Por 1 un)
                                        </span>
                                        <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                                            Insumos do Estoque Geral
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setModalAberto(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-gray-400"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="flex gap-2 bg-gray-100 p-1.5 rounded-2xl max-w-md">
                <button
                    type="button"
                    onClick={() => setAbaAtiva("DIA")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                        abaAtiva === "DIA"
                            ? "bg-white text-orange-600 shadow-sm"
                            : "text-gray-500"
                    }`}
                >
                    Estoque do Dia (PDV)
                </button>
                <button
                    type="button"
                    onClick={() => setAbaAtiva("GERAL")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                        abaAtiva === "GERAL"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-500"
                    }`}
                >
                    Estoque Geral (Insumos)
                </button>
            </div>

            {podeEditar && abaAtiva === "DIA" && (
                <form
                    onSubmit={handleProduzirLote}
                    className="bg-orange-50/70 p-4 rounded-2xl border border-orange-100 flex flex-wrap items-end gap-4"
                >
                    <div className="flex-1 min-w-[220px]">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            Produto Pronto (Estoque do Dia)
                        </label>
                        <select
                            value={selectedProdutoId}
                            onChange={(e) => setSelectedProdutoId(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 font-bold text-gray-700"
                        >
                            {produtosDia.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.nome} (Atual: {p.estoque} {p.unidade || "un"})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-32">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            Qtd. Lote
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={quantidadeLote}
                            onChange={(e) => setQuantidadeLote(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 font-bold text-gray-800"
                        />
                    </div>
                    <button
                        type="submit"
                        className="bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-orange-700 transition-all"
                    >
                        Confirmar Produção
                    </button>
                </form>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-gray-50">
                        {carregando ? (
                            <tr>
                                <td className="p-8 text-center text-gray-400 italic">
                                    Carregando inventário via API REST...
                                </td>
                            </tr>
                        ) : (
                            produtosFiltrados.map((p) => (
                                <tr key={p.id} className="hover:bg-orange-50/30">
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        <div>
                                            {p.nome}
                                            {p.precisa_reestoque && (
                                                <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                                    ⚠️ Reestoque Necessário
                                                </span>
                                            )}
                                        </div>
                                        {p.tipo_estoque === "GERAL" &&
                                            Array.isArray(p.lotes) &&
                                            p.lotes.length > 0 && (
                                                <p className="text-blue-600 text-xs font-medium mt-1">
                                                    FEFO 1º Lote: #{p.lotes[0].numeroLote} ({p.lotes[0].quantidade} {p.unidade || "un"} • Val: {p.lotes[0].validade})
                                                </p>
                                            )}
                                    </td>
                                    <td className="px-6 py-4 font-black text-gray-700">
                                        {p.estoque} {p.unidade || "un"}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

