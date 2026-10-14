import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import POS from './pages/POS';
import Stock from './pages/Stock';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import Customers from './pages/Customers';
import Users from './pages/Users';
import UserLogin from './components/UserLogin';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';
import BusinessSettings from './pages/BusinessSettings';
import { Capacitor } from '@capacitor/core';
import { saveDatabaseBackup } from './utils/databaseBackup';
import './index.css';

const DATABASE_BACKUP_INTERVAL_MS = 60 * 60 * 1000;

function RequireAuth({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-medium">
        <div className="animate-spin mr-2">🛠️</div> Loading your POS system...
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
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let lastBackupAt = Date.now();
    let backupInProgress = false;
    const createBackup = async () => {
      if (backupInProgress) return;
      backupInProgress = true;
      try {
        await saveDatabaseBackup();
        lastBackupAt = Date.now();
      } catch (error) {
        console.error('Automatic database backup failed:', error);
      } finally {
        backupInProgress = false;
      }
    };
    const checkBackupInterval = () => {
      if (Date.now() - lastBackupAt >= DATABASE_BACKUP_INTERVAL_MS) {
        createBackup();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        createBackup();
      }
    };

    const intervalId = window.setInterval(checkBackupInterval, 60 * 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div
      className="min-h-screen w-full min-w-[600px] bg-slate-100 text-slate-800 flex flex-col lg:flex-row"
      style={{ zoom: Math.min(1, viewportWidth / 600) }}
    >
      {currentUser && <Navbar />}
      <main className="flex-1 min-w-0 sm:p-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/login" element={<UserLogin />} />
          <Route path="/" element={<RequireAuth><POS /></RequireAuth>} />
          <Route path="/stock" element={<RequireAuth><StockRoute><Stock /></StockRoute></RequireAuth>} />
          <Route path="/purchase" element={<RequireAuth><Purchase /></RequireAuth>} />
          <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
          <Route path="/sales" element={<RequireAuth><Sales /></RequireAuth>} />
          <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><BusinessSettings /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
