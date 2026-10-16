import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, Layers, QrCode, LogOut, PackageSearch, Store } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardLayout() {
  const { logout, tenantId } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const navItems = [
    { path: '/pos', icon: ShoppingCart, label: 'Vendas (PDV)' },
    { path: '/inventory', icon: Layers, label: 'Inventário' },
    { path: '/qrcode', icon: QrCode, label: 'Gerar QR Code' },
  ];

  return (
    <div className="h-screen flex flex-col md:flex-row bg-dark-50 overflow-hidden font-sans">
      <aside className="w-full md:w-72 bg-white/80 backdrop-blur-xl border-r border-dark-100 flex flex-col shadow-sm z-10 h-full">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <PackageSearch className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-dark-800 tracking-tight">Estocaí</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 ${
                  isActive 
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 transform scale-[1.02]' 
                    : 'text-dark-500 hover:bg-orange-50 hover:text-orange-600'
                }`
              }
            >
              <item.icon className="w-5 h-5" /> {item.label}
            </NavLink>
          ))}
          <a
            href={`/cardapio/${tenantId || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 text-dark-500 hover:bg-orange-50 hover:text-orange-600"
          >
            <Layers className="w-5 h-5" /> Cardápio Web
          </a>
        </nav>

        <div className="p-6 bg-white/50 border-t border-dark-50 space-y-3">
          {tenantId && (
            <div className="flex items-center justify-between text-xs font-semibold text-dark-500 bg-dark-50/80 px-3.5 py-2.5 rounded-xl border border-dark-100">
              <div className="flex items-center gap-2 truncate">
                <Store className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                <span className="truncate">Negócio: <strong className="text-dark-700 uppercase">{tenantId}</strong></span>
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl text-red-500 font-bold hover:bg-red-50 hover:shadow-sm transition-all duration-300"
          >
            <LogOut className="w-5 h-5" /> Sair da conta
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 overflow-y-auto h-full relative">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50/30 to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto pb-10 relative z-10 animate-fade-in h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
