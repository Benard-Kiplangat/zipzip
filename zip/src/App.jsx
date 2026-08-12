<<<<<<< HEAD
import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getConfig } from "./utils/config";
=======
import React from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
import POS from './pages/POS';
import Stock from './pages/Stock';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import Customers from './pages/Customers';
import Users from './pages/Users';
import UserLogin from './components/UserLogin';
<<<<<<< HEAD
import Navbar from './components/Navbar';
=======
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
import { useAuth } from './context/AuthContext';
import './index.css';

function RequireAuth({ children }) {
  const { currentUser, loading } = useAuth();
<<<<<<< HEAD
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-medium">
        <div className="animate-spin mr-2">🛠️</div> Loading Imara Auto Spares POS...
      </div>
    );
  }
=======
  if (loading) return <div className="p-4">Loading...</div>;
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
  return currentUser ? children : <Navigate to="/login" replace />;
}

function StockRoute({ children }) {
  const { currentUser, loading, canViewStock } = useAuth();
<<<<<<< HEAD
  if (loading) return null;
=======
  if (loading) return <div className="p-4">Loading...</div>;
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
  return currentUser && canViewStock ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const { currentUser, loading, isAdmin } = useAuth();
<<<<<<< HEAD
  if (loading) return null;
=======
  if (loading) return <div className="p-4">Loading...</div>;
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
  return currentUser && isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
<<<<<<< HEAD
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
=======
  const { currentUser, isAdmin, canViewStock, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex flex-col">
      <nav className="flex max-w-xl">
        <Link
          to="/"
          className={`flex-1 border rounded p-2 m-4 text-center btn ${location.pathname === '/' ? 'bg-green-500 font-bold' : 'hover:bg-green-600'}`}
        >
          POS
        </Link>
        {canViewStock && (
          <Link
            to="/stock"
            className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/stock' ? 'bg-orange-500 font-bold' : 'hover:bg-orange-600'}`}
          >
            Stock
          </Link>
        )}
        <Link
          to="/purchase"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/purchase' ? 'bg-purple-500 font-bold' : 'hover:bg-purple-600'}`}
        >
          Purchases
        </Link>
        <Link
          to="/sales"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/stock' ? 'bg-orange-500 font-bold' : 'hover:bg-orange-600'}`}
        >
          Sales
        </Link>
        <Link
          to="/customers"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/customers' ? 'bg-teal-500 font-bold' : 'hover:bg-teal-600'}`}
        >
          Customers
        </Link>
        {isAdmin && (
          <Link
            to="/users"
            className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/users' ? 'bg-sky-500 font-bold' : 'hover:bg-sky-600'}`}
          >
            Users
          </Link>
        )}
        <div className="flex-1 p-4 flex flex-col justify-center items-end gap-1">
          {currentUser ? (
            <>
              <div className="text-sm text-gray-700">{currentUser.username}</div>
              <button onClick={logout} className="text-xs text-red-600 underline">Logout</button>
            </>
          ) : (
            <Link to="/login" className="text-xs text-blue-600 underline">Login</Link>
          )}
        </div>
      </nav>
      <div className="flex-grow">
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
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
<<<<<<< HEAD
      </main>
    </div>
  );
}

=======
      </div>
    </div>
  );
}
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
