import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getConfig } from "./utils/config";
import POS from './pages/POS';
import Stock from './pages/Stock';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import Customers from './pages/Customers';
import Users from './pages/Users';
import UserLogin from './components/UserLogin';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';
import './index.css';

function RequireAuth({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-medium">
        <div className="animate-spin mr-2">🛠️</div> Loading Imara Auto Spares POS...
      </div>
    );
  }
  return currentUser ? children : <Navigate to="/login" replace />;
}

function StockRoute({ children }) {
  const { currentUser, loading, canViewStock } = useAuth();
  if (loading) return null;
  return currentUser && canViewStock ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const { currentUser, loading, isAdmin } = useAuth();
  if (loading) return null;
  return currentUser && isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { currentUser } = useAuth();

  useEffect(() => {
    getConfig()
      .then(config => {
        if (config.businessName) {
          document.title = config.businessName;
        }
      })
      .catch(error => {
        console.error("Failed to load app config:", error);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col lg:flex-row">
      {currentUser && <Navbar />}
      <main className="flex-1 min-w-0 p-4 lg:p-8 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/login" element={<UserLogin />} />
          <Route path="/" element={<RequireAuth><POS /></RequireAuth>} />
          <Route path="/stock" element={<StockRoute><Stock /></StockRoute>} />
          <Route path="/purchase" element={<RequireAuth><Purchase /></RequireAuth>} />
          <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
          <Route path="/sales" element={<RequireAuth><Sales /></RequireAuth>} />
          <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

