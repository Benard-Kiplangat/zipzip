<<<<<<< HEAD
import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
=======
import React from "react";
import { useAuth } from "../context/AuthContext";
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff

function getMondayOfWeek(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

export default function WeeklySummary({ allSales = [], selectedDate }) {
  const { canViewProfit } = useAuth();
  const monday = getMondayOfWeek(selectedDate);

<<<<<<< HEAD
  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }), [monday]);

  const sunday = days[6];

  const { rows, totals } = useMemo(() => {
    const salesByDate = {};

    allSales.forEach(sale => {
      const key = new Date(sale.timestamp).toLocaleDateString();
      if (!salesByDate[key]) salesByDate[key] = [];
      salesByDate[key].push(sale);
    });

    const rows = days.map(d => {
      const key = d.toLocaleDateString();
      const salesForDay = salesByDate[key] || [];
      const totalSales = salesForDay.reduce((sum, s) => sum + (s.quantity || 0), 0);
      const totalRevenue = salesForDay.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalProfit = salesForDay.reduce((sum, s) => sum + (s.profit || 0), 0);
      const creditGross = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.total || 0), 0);
      const creditDown = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.dwnPayment || 0), 0);
      const creditDue = creditGross - creditDown;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      return { date: key, dayName, totalSales, totalRevenue, totalProfit, creditDue };
    });

    const totals = rows.reduce((acc, r) => ({
      totalSales: acc.totalSales + r.totalSales,
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      totalProfit: acc.totalProfit + r.totalProfit,
      totalCreditDue: acc.totalCreditDue + (r.creditDue || 0),
    }), { totalSales: 0, totalRevenue: 0, totalProfit: 0, totalCreditDue: 0 });

    return { rows, totals };
  }, [allSales, days]);
=======
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const sunday = days[6];

  const rows = days.map(d => {
    const key = d.toLocaleDateString();
    const salesForDay = allSales.filter(s => new Date(s.timestamp).toLocaleDateString() === key);
    const totalSales = salesForDay.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const totalRevenue = salesForDay.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = salesForDay.reduce((sum, s) => sum + (s.profit || 0), 0);
    const creditGross = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.total || 0), 0);
    const creditDown = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.dwnPayment || 0), 0);
    const creditDue = creditGross - creditDown;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    return { date: key, dayName, totalSales, totalRevenue, totalProfit, creditDue };
  });

  const totals = rows.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.totalSales,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
    totalProfit: acc.totalProfit + r.totalProfit,
    totalCreditDue: acc.totalCreditDue + (r.creditDue || 0),
  }), { totalSales: 0, totalRevenue: 0, totalProfit: 0, totalCreditDue: 0 });
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff

  const fmt = d => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1 mt-4">Weekly Summary</h2>
      <p className="text-sm text-gray-500 mb-3">
        Mon {fmt(monday)} — Sun {fmt(sunday)}
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className={`border p-3 rounded flex justify-between ${r.totalSales === 0 ? 'bg-gray-50 text-gray-400' : 'bg-white'}`}>
            <div className="font-medium w-24">{r.dayName} <span className="text-xs font-normal">{r.date}</span></div>
            <div className="text-sm text-right">
              {r.totalSales === 0
                ? <span className="italic">No sales</span>
                : <>
<<<<<<< HEAD
                    Credit Due: KES {formatWhole(r.creditDue)} | Revenue: KES {formatWhole(r.totalRevenue)}
                    {canViewProfit && <> | Profit: KES {formatWhole(r.totalProfit)}</>}
=======
                    Credit Due: KES {r.creditDue} | Revenue: KES {r.totalRevenue}
                    {canViewProfit && <> | Profit: KES {r.totalProfit}</>}
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
                  </>
              }
            </div>
          </div>
        ))}
        <div className="mt-3 p-3 border rounded bg-yellow-50">
          <div className="font-semibold mb-1">Week Totals</div>
<<<<<<< HEAD
          <div>Total Credit Due: KES {formatWhole(totals.totalCreditDue)}</div>
          <div>Total Revenue: KES {formatWhole(totals.totalRevenue)}</div>
          {canViewProfit && <div>Total Profit: KES {formatWhole(totals.totalProfit)}</div>}
=======
          <div>Total Credit Due: KES {totals.totalCreditDue}</div>
          <div>Total Revenue: KES {totals.totalRevenue}</div>
          {canViewProfit && <div>Total Profit: KES {totals.totalProfit}</div>}
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
        </div>
      </div>
    </div>
  );
}
