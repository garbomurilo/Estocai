import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ProdutosAPI, PedidosAPI } from '../services/api';
import { ShoppingBag, CheckCircle, Trash2, AlertCircle } from 'lucide-react';

export default function POS() {
  const { auth } = useAuth();
  const [produtos, setProdutos] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    carregarProdutos();
  }, []);

  const carregarProdutos = async () => {
    setLoading(true);
    setErro('');
    try {
      // API REST → GET /api/produtos?tipo=DIA
      const dados = await ProdutosAPI.listar(auth, 'DIA');
      const prods = dados.filter(p => p.ativo && p.preco > 0);
      setProdutos(prods);
    } catch (error) {
      console.error("Erro ao carregar PDV:", error);
      setErro('Não foi possível conectar ao servidor. Verifique se o Backend está rodando na porta 3000.');
    } finally {
      setLoading(false);
    }
  };

  const adicionarAoCarrinho = (produto) => {
    const itemExistente = carrinho.find(item => item.id === produto.id);
    if (itemExistente) {
      if (itemExistente.quantidade >= produto.estoque) {
        setErro(`Estoque insuficiente! Disponível: ${produto.estoque}x ${produto.nome}.`);
        setTimeout(() => setErro(''), 3000);
        return;
      }
      setCarrinho(carrinho.map(item =>
        item.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item
      ));
    } else {
      if (produto.estoque < 1) {
        setErro(`Produto "${produto.nome}" está esgotado.`);
        setTimeout(() => setErro(''), 3000);
        return;
      }
      setCarrinho([...carrinho, { ...produto, quantidade: 1 }]);
    }
  };

  const removerDoCarrinho = (index) => {
    const novoCarrinho = [...carrinho];
    novoCarrinho.splice(index, 1);
    setCarrinho(novoCarrinho);
  };

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return;
    if (!window.confirm("Confirmar venda e abater estoque?")) return;

    setIsProcessing(true);
    setErro('');
    try {
      // API REST → POST /api/pedidos/fechar (com transação ACID no servidor)
      const resultado = await PedidosAPI.fechar(auth, {
        itens: carrinho.map(item => ({
          id: item.id,
          nome: item.nome,
          quantidade: item.quantidade,
        })),
        formaPagamento: 'DINHEIRO',
        desconto: 0,
      });

      setSucesso(`✅ Venda finalizada! Pedido: ${resultado.pedidoId} — Total: R$ ${resultado.valorTotal.toFixed(2)}`);
      setTimeout(() => setSucesso(''), 6000);
      setCarrinho([]);
      await carregarProdutos();
    } catch (error) {
      console.error("Erro na venda:", error);
      setErro(`Erro ao finalizar venda: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const valorTotal = carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
  const qtdTotal = carrinho.reduce((acc, item) => acc + item.quantidade, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <h2 className="text-3xl font-black text-dark-800 tracking-tight">Ponto de Venda</h2>

      {/* Alertas */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3 font-medium animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-5 py-4 rounded-2xl flex items-center gap-3 font-medium animate-fade-in">
          <CheckCircle className="w-5 h-5 shrink-0" />
          {sucesso}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
        {/* Catálogo */}
        <div className="flex-1 bg-white/70 backdrop-blur-md p-6 rounded-[32px] shadow-premium border border-white flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-dark-700 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-orange-500" /> Catálogo Rápido
            </h3>
            <button
              onClick={carregarProdutos}
              className="text-xs font-bold text-orange-500 hover:text-orange-700 transition-colors"
            >
              ↻ Atualizar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 pb-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-dark-400">
                <div className="animate-pulse text-center">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Conectando ao servidor...</p>
                </div>
              </div>
            ) : produtos.length === 0 ? (
              <p className="text-dark-400 italic">Nenhum produto disponível no estoque do dia.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {produtos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => adicionarAoCarrinho(p)}
                    disabled={p.estoque < 1}
                    className="bg-white hover:bg-orange-50 border border-dark-100 hover:border-orange-200 p-5 rounded-2xl flex flex-col items-center justify-center text-center transition-all h-36 gap-2 shadow-sm hover:shadow-md active:scale-95 group disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-dark-800 text-sm leading-tight group-hover:text-orange-700 transition-colors">{p.nome}</span>
                    <span className="text-orange-600 font-black text-lg">R$ {p.preco.toFixed(2)}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md ${p.estoque <= 5 ? 'bg-red-50 text-red-500' : 'bg-dark-50 text-dark-400'}`}>
                      {p.estoque <= 0 ? 'Esgotado' : `${p.estoque} un`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Carrinho */}
        <div className="w-full xl:w-[400px] bg-white p-6 rounded-[32px] shadow-premium border border-dark-100 flex flex-col shrink-0">
          <h3 className="text-xl font-bold text-dark-700 mb-6 flex justify-between items-center">
            Pedido Atual
            <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-sm font-black shadow-sm">
              {qtdTotal} itens
            </span>
          </h3>

          <div className="flex-1 overflow-y-auto mb-6 border-b border-dark-100 pb-4 space-y-3">
            {carrinho.length === 0 ? (
              <div className="text-center text-dark-300 mt-20 flex flex-col items-center">
                <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
                <p className="font-medium">Nenhum item selecionado</p>
              </div>
            ) : (
              carrinho.map((item, index) => (
                <div key={index} className="flex justify-between items-center bg-dark-50 p-4 rounded-2xl border border-dark-100 transition-all hover:border-orange-200">
                  <div className="flex-1">
                    <p className="font-bold text-dark-800 text-sm mb-1">{item.nome}</p>
                    <p className="text-xs text-orange-600 font-bold">
                      R$ {item.preco.toFixed(2)} <span className="text-dark-400 font-medium">x{item.quantidade}</span>
                    </p>
                  </div>
                  <div className="font-black text-dark-800 mr-4 text-lg">
                    R$ {(item.preco * item.quantidade).toFixed(2)}
                  </div>
                  <button
                    onClick={() => removerDoCarrinho(index)}
                    className="text-red-400 hover:text-white hover:bg-red-500 p-2 bg-white rounded-xl shadow-sm border border-dark-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4 pt-2 mt-auto">
            <div className="flex justify-between items-end mb-6 bg-dark-50 p-4 rounded-2xl">
              <span className="text-dark-500 font-bold uppercase tracking-wider text-sm">Total a pagar</span>
              <span className="text-3xl font-black text-dark-800">R$ {valorTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={finalizarVenda}
              disabled={isProcessing || carrinho.length === 0}
              className="w-full bg-gradient-to-r from-green-400 to-green-500 text-white font-black py-4 rounded-2xl hover:from-green-500 hover:to-green-600 transition-all shadow-lg shadow-green-500/30 flex justify-center items-center gap-2 disabled:opacity-50 transform hover:-translate-y-1"
            >
              <CheckCircle className="w-6 h-6" />
              {isProcessing ? 'Processando no Servidor...' : 'Finalizar Venda'}
            </button>
            <button
              onClick={() => { if (window.confirm('Cancelar pedido?')) setCarrinho([]) }}
              disabled={carrinho.length === 0}
              className="w-full bg-white text-red-500 font-bold py-3.5 rounded-2xl border-2 border-red-50 hover:bg-red-50 transition-all disabled:opacity-50"
            >
              Cancelar Pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
