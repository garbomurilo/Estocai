import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ProdutosAPI } from '../services/api';
import { Plus, Search, Edit2, Trash2, Archive, ShoppingBag, X, Save, AlertCircle, CheckCircle } from 'lucide-react';

export default function Inventory() {
  const { auth } = useAuth();
  const [tipoEstoque, setTipoEstoque] = useState('DIA');
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    nome: '', preco: 0, estoque: 0, categoria: 'Geral', unidade: 'un', tipo_estoque: 'DIA', ativo: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carregarEstoque();
  }, [tipoEstoque]);

  const carregarEstoque = async () => {
    setLoading(true);
    setErro('');
    try {
      // API REST → GET /api/produtos?tipo=DIA ou GERAL
      const dados = await ProdutosAPI.listar(auth, tipoEstoque);
      setProdutos(dados);
    } catch (error) {
      console.error("Erro ao carregar estoque:", error);
      setErro('Não foi possível conectar ao servidor. Verifique se o Backend está rodando na porta 3000.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Excluir "${nome}"? Esta ação é irreversível.`)) return;
    try {
      // API REST → PUT /api/produtos/:id — marca como inativo em vez de deletar
      await ProdutosAPI.atualizar(auth, id, { ativo: false });
      setSucesso(`"${nome}" removido do estoque.`);
      setTimeout(() => setSucesso(''), 4000);
      carregarEstoque();
    } catch (error) {
      setErro(`Erro ao remover: ${error.message}`);
    }
  };

  const openModal = (produto = null) => {
    if (produto) {
      setEditId(produto.id);
      setFormData({ ...produto });
    } else {
      setEditId(null);
      setFormData({ nome: '', preco: 0, estoque: 0, categoria: 'Geral', unidade: 'un', tipo_estoque: tipoEstoque, ativo: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErro('');
    try {
      const dataToSave = {
        ...formData,
        preco: parseFloat(formData.preco) || 0,
        estoque: parseInt(formData.estoque) || 0,
      };

      if (editId) {
        // API REST → PUT /api/produtos/:id
        await ProdutosAPI.atualizar(auth, editId, dataToSave);
        setSucesso(`"${dataToSave.nome}" atualizado com sucesso!`);
      } else {
        // API REST → POST /api/produtos
        await ProdutosAPI.criar(auth, dataToSave);
        setSucesso(`"${dataToSave.nome}" cadastrado com sucesso!`);
      }

      setTimeout(() => setSucesso(''), 4000);
      setIsModalOpen(false);
      carregarEstoque();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      setErro(`Erro ao salvar produto: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const filtrados = produtos.filter(p => p.nome?.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-dark-800 tracking-tight">Gestão de Inventário</h2>
        <button
          onClick={() => openModal()}
          className="bg-dark-800 text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-black flex items-center justify-center gap-2 transition-all shadow-premium hover:shadow-lg transform hover:-translate-y-1"
        >
          <Plus className="w-5 h-5" /> Novo Item
        </button>
      </div>

      {/* Alertas */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3 font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-5 py-4 rounded-2xl flex items-center gap-3 font-medium">
          <CheckCircle className="w-5 h-5 shrink-0" />
          {sucesso}
        </div>
      )}

      {/* Filtro de tipo */}
      <div className="flex bg-white p-1.5 rounded-2xl w-full max-w-md shadow-sm border border-dark-100">
        <button
          onClick={() => setTipoEstoque('DIA')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${tipoEstoque === 'DIA' ? 'bg-orange-50 text-orange-600 shadow-sm border border-orange-100' : 'text-dark-400 hover:text-dark-600'}`}
        >
          <ShoppingBag className="w-4 h-4" /> Estoque do Dia
        </button>
        <button
          onClick={() => setTipoEstoque('GERAL')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${tipoEstoque === 'GERAL' ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100' : 'text-dark-400 hover:text-dark-600'}`}
        >
          <Archive className="w-4 h-4" /> Estoque Geral
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-dark-300" />
        <input
          type="text"
          placeholder="Buscar produto pelo nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-dark-100 focus:ring-2 focus:ring-orange-500 outline-none font-medium text-dark-700 shadow-sm transition-all"
        />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-[32px] overflow-hidden shadow-premium border border-dark-100 flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left">
            <thead className="bg-dark-50 sticky top-0 z-10 border-b border-dark-100">
              <tr className="text-dark-400 uppercase font-bold text-[10px] tracking-widest">
                <th className="px-6 md:px-8 py-5">Item / Produto</th>
                <th className="px-6 md:px-8 py-5">Quantidade</th>
                <th className="px-6 md:px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {loading ? (
                <tr><td colSpan="3" className="text-center py-12 text-dark-400 italic font-medium">Conectando ao servidor...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan="3" className="text-center py-12 text-dark-400 font-medium">Nenhum item nesta categoria.</td></tr>
              ) : (
                filtrados.map(p => (
                  <tr key={p.id} className="hover:bg-orange-50/30 transition-colors group">
                    <td className="px-6 md:px-8 py-5">
                      <p className="font-bold text-dark-800 text-sm md:text-base">{p.nome}</p>
                      {tipoEstoque === 'DIA' ? (
                        <p className="text-xs text-orange-600 font-bold mt-1 uppercase tracking-wider">
                          {p.categoria} <span className="text-dark-300 mx-1">•</span> R$ {Number(p.preco || 0).toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-xs text-blue-500 font-bold mt-1 uppercase tracking-wider">{p.categoria}</p>
                      )}
                    </td>
                    <td className="px-6 md:px-8 py-5">
                      <span className={`font-black text-xl ${p.estoque <= 5 ? 'text-red-500' : 'text-dark-700'}`}>
                        {p.estoque} <span className="text-sm font-bold text-dark-300 ml-1">{p.unidade}</span>
                      </span>
                    </td>
                    <td className="px-6 md:px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openModal(p)} className="p-2.5 text-blue-500 hover:bg-blue-50 hover:shadow-sm rounded-xl transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.nome)} className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 hover:shadow-sm rounded-xl transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-dark-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-lg shadow-2xl border border-dark-100 relative animate-slide-up">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 text-dark-400 hover:text-dark-800 hover:bg-dark-50 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black text-dark-800 tracking-tight mb-8">
              {editId ? 'Editar Item' : 'Novo Item'}
            </h3>

            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Nome do Item</label>
                <input type="text" required value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-dark-50 border border-dark-100 focus:bg-white focus:border-orange-500 outline-none font-medium text-dark-800 transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Preço (R$)</label>
                  <input type="number" step="0.01" min="0" value={formData.preco} onChange={e => setFormData({ ...formData, preco: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-dark-50 border border-dark-100 focus:bg-white focus:border-orange-500 outline-none font-medium text-dark-800 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Estoque</label>
                  <input type="number" required min="0" value={formData.estoque} onChange={e => setFormData({ ...formData, estoque: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-dark-50 border border-dark-100 focus:bg-white focus:border-orange-500 outline-none font-medium text-dark-800 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Categoria</label>
                  <input type="text" required value={formData.categoria} onChange={e => setFormData({ ...formData, categoria: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-dark-50 border border-dark-100 focus:bg-white focus:border-orange-500 outline-none font-medium text-dark-800 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Unidade</label>
                  <select value={formData.unidade} onChange={e => setFormData({ ...formData, unidade: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-dark-50 border border-dark-100 focus:bg-white focus:border-orange-500 outline-none font-bold text-dark-800 transition-all cursor-pointer">
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="L">Litro (L)</option>
                    <option value="ml">Mililitro (ml)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-dark-500 uppercase tracking-wider block mb-2">Destino (Tipo)</label>
                <select value={formData.tipo_estoque} onChange={e => setFormData({ ...formData, tipo_estoque: e.target.value })} className="w-full px-4 py-3.5 rounded-xl bg-orange-50 border border-orange-100 focus:border-orange-500 outline-none font-bold text-orange-700 transition-all cursor-pointer">
                  <option value="DIA">Vendas (Dia) — Aparece no PDV</option>
                  <option value="GERAL">Estoque Geral (Matéria Prima)</option>
                </select>
              </div>

              <div className="pt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3.5 rounded-xl font-bold text-dark-400 hover:text-dark-800 hover:bg-dark-50 transition-all">Cancelar</button>
                <button type="submit" disabled={saving} className="px-8 py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30 flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-5 h-5" /> {saving ? 'Salvando...' : 'Salvar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
