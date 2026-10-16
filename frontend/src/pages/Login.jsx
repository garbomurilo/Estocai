import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('Acesso negado! Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 animate-fade-in relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-orange-300/30 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-orange-400/20 rounded-full blur-3xl"></div>

      <div className="glass-panel p-10 w-full max-w-md text-center z-10 animate-slide-up">
        <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-lg shadow-orange-500/40">
          <PackageSearch className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-black text-dark-800 tracking-tight mb-2">Estocaí</h1>
        <p className="text-dark-500 mb-8 font-medium">Gestão inteligente para o seu negócio</p>
        
        {error && <div className="bg-red-50 text-red-500 p-3 rounded-xl mb-4 font-bold text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="email" 
            placeholder="Seu e-mail" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-4 rounded-xl bg-white/50 border border-white focus:ring-2 focus:ring-orange-500 transition-all outline-none font-medium text-dark-700 placeholder-dark-400 shadow-sm" 
            required 
          />
          <input 
            type="password" 
            placeholder="Sua senha" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-4 rounded-xl bg-white/50 border border-white focus:ring-2 focus:ring-orange-500 transition-all outline-none font-medium text-dark-700 placeholder-dark-400 shadow-sm" 
            required 
          />
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold py-4 rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-xl shadow-orange-500/30 disabled:opacity-70 transform hover:-translate-y-1"
          >
            {loading ? 'Autenticando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}
