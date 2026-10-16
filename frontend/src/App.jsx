import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import QRCodePage from './pages/QRCodePage';
import DigitalMenu from './pages/DigitalMenu';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Cardápio Digital — rota pública, sem autenticação */}
      <Route path="/cardapio/:tenantId" element={<DigitalMenu />} />
      <Route path="/cardapio" element={<Navigate to="/login" />} />

      {/* Rotas protegidas */}
      <Route path="/" element={
        <PrivateRoute>
          <DashboardLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="/pos" />} />
        <Route path="pos" element={<POS />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="qrcode" element={<QRCodePage />} />
      </Route>

      {/* Rota fallback */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  return (
    // AuthProvider FORA do Router para garantir que o contexto está disponível em toda a árvore
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
