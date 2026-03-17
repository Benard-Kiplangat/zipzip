import React from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import POS from './pages/POS';
import Stock from './pages/Stock';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import './index.css';

export default function App() {
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
        <Link
          to="/stock"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/stock' ? 'bg-orange-500 font-bold' : 'hover:bg-orange-600'}`}
        >
          Stock
        </Link>
        <Link
          to="/purchase"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/purchase' ? 'bg-purple-500 font-bold' : 'hover:bg-purple-600'}`}
        >
          Purchase
        </Link>
        <Link
          to="/sales"
          className={`flex-1 border text-center rounded p-2 m-4 ${location.pathname === '/sales' ? 'bg-blue-500 font-bold' : 'hover:bg-blue-600'}`}
        >
          Sales
        </Link>
        <div className="flex-1 p-4"></div>
      </nav>
        <div className="flex-grow">
        <Routes>
          <Route path="/" element={<POS />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/sales" element={<Sales />} />
        </Routes>
      </div>
    </div>
  );
}
