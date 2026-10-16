import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChefHat, ShoppingBag, Store } from 'lucide-react';

export default function DigitalMenu() {
  const { tenantId } = useParams();
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) {
      setError('Loja não especificada no link.');
      setLoading(false);
      return;
    }
    carregarCardapio();
  }, [tenantId]);

  const carregarCardapio = async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/produtos/public/${tenantId}`);
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
          throw new Error('Erro na API');
      }

      const prods = data.dados.filter(p => p.preco > 0);
      
      // Group by category
      const grouped = prods.reduce((acc, curr) => {
        const cat = curr.categoria || 'Outros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(curr);
        return acc;
      }, {});
      
      setProdutos(grouped);
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar o cardápio. Loja pode não existir.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-50 flex items-center justify-center">
        <div className="animate-pulse-slow text-orange-500 flex flex-col items-center">
          <ChefHat className="w-16 h-16 mb-4" />
          <p className="font-bold tracking-widest uppercase">Preparando cardápio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dark-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full border border-red-100">
          <Store className="w-16 h-16 mx-auto text-red-400 mb-6" />
          <h2 className="text-2xl font-black text-dark-800 mb-2">Ops!</h2>
          <p className="text-dark-500 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50 pb-20 font-sans">
      <header className="bg-gradient-to-br from-orange-500 to-orange-700 text-white pt-16 pb-24 px-6 text-center rounded-b-[60px] shadow-xl relative overflow-hidden">
        {/* Decorative patterns */}
        <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-black/10 rounded-full blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mb-6 shadow-glass border border-white/30">
            <ChefHat className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-3 uppercase">{tenantId}</h1>
          <p className="text-orange-100 font-medium text-lg max-w-xs mx-auto leading-relaxed">
            Faça seu pedido diretamente no caixa.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 -mt-12 relative z-20 space-y-10">
        {Object.keys(produtos).length === 0 ? (
          <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-premium text-center border border-white">
            <ShoppingBag className="w-12 h-12 mx-auto text-dark-300 mb-4" />
            <p className="text-dark-500 font-medium">Nenhum produto disponível hoje.</p>
          </div>
        ) : (
          Object.entries(produtos).map(([categoria, itens]) => (
            <div key={categoria} className="animate-slide-up">
              <h2 className="text-2xl font-black text-dark-800 mb-6 flex items-center gap-3">
                <span className="w-8 h-1 bg-orange-500 rounded-full"></span>
                {categoria}
              </h2>
              <div className="space-y-4">
                {itens.map(p => (
                  <div key={p.id} className="bg-white p-6 rounded-[28px] shadow-sm border border-dark-100 flex justify-between items-center hover:shadow-premium hover:-translate-y-1 transition-all duration-300">
                    <div>
                      <h3 className="font-bold text-dark-800 text-lg mb-1">{p.nome}</h3>
                      <p className="text-xs font-medium text-dark-400">
                        {p.estoque > 0 ? 'Disponível' : 'Esgotado'}
                      </p>
                    </div>
                    <div className="bg-orange-50 px-5 py-3 rounded-2xl border border-orange-100 shadow-sm">
                      <span className="font-black text-orange-600 text-lg">R$ {p.preco.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
