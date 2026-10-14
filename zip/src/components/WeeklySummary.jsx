import React, { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
import Charts from "./Charts"

function getStartOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeCreditDue(salesForPeriod) {
  let due = 0;
  const bulkGroups = {};
  const normalSales = [];

  salesForPeriod.forEach(sale => {
    if (sale.isCreditSale && sale.isBulkSale && sale.bulkSaleId) {
      if (!bulkGroups[sale.bulkSaleId]) bulkGroups[sale.bulkSaleId] = [];
      bulkGroups[sale.bulkSaleId].push(sale);
    } else if (sale.isCreditSale) {
      normalSales.push(sale);
    }
  });

  Object.values(bulkGroups).forEach(items => {
    const first = items[0];
    const bulkTotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
    const initialDwn = Number(
      first.initialBulkDwnPayment ??
      first.bulkDwnPayment ??
      first.dwnPayment ??
      0
    );
    const paymentHistory = Array.isArray(first.paymentHistory) ? first.paymentHistory : [];
    const historyPaid = paymentHistory.reduce((s, p) => s + Number(p.amount || 0), 0);
    due += Math.max(0, bulkTotal - initialDwn - historyPaid);
  });

  normalSales.forEach(sale => {
    const total = Number(sale.total || 0);
    const initialDwn = Number(
      sale.initialDwnPayment ??
      sale.dwnPayment ??
      0
    );
    const paymentHistory = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
    const historyPaid = paymentHistory.reduce((s, p) => s + Number(p.amount || 0), 0);
    due += Math.max(0, total - initialDwn - historyPaid);
  });

  return due;
}

export default function WeeklySummary({ allSales = [], selectedDate }) {
  const { canViewProfit } = useAuth();
  const today = getStartOfDay(selectedDate);

  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d;
  }), [today]);

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
      const totalSales = salesForDay.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
      const totalRevenue = salesForDay.reduce((sum, s) => sum + Number(s.total || 0), 0);
      const totalProfit = salesForDay.reduce((sum, s) => sum + Number(s.profit || 0), 0);
      const creditDue = computeCreditDue(salesForDay);
      const creditValue = salesForDay.filter(sale => sale.isCreditSale).reduce((sum, sale) => sum + (sale.total || 0), 0);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

      return {
        date: key,
        sortKey: new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate()
        ).getTime(),
        dayName,
        label: dayName,
        totalSales,
        totalRevenue,
        totalProfit,
        creditDue,
        creditValue,
      };
    });

    const totals = rows.reduce((acc, r) => ({
      totalSales: acc.totalSales + r.totalSales,
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      totalProfit: acc.totalProfit + r.totalProfit,
      totalCreditDue: acc.totalCreditDue + (r.creditDue || 0),
      totalCreditValue: acc.totalCreditValue + (r.creditValue || 0),
    }), { totalSales: 0, totalRevenue: 0, totalProfit: 0, totalCreditDue: 0, totalCreditValue: 0 });

    return { rows, totals };
  }, [allSales, days]);

  return (
    <div className="">
      <section>
        <div className="w-full overflow-x-auto">
          <div className="min-w-[900px]">
          <Charts rows={rows} selectedDate={selectedDate} period="weekly"/>
          </div>
        </div>
          <div className="mt-5 space-y-2">
            {rows.map((r, i) => (
              <div key={i} className={`border p-3 rounded-xl flex justify-between ${r.totalSales === 0 ? 'bg-gray-50 text-gray-400' : 'bg-white'}`}>
                <div className="font-medium w-24">{r.dayName} <span className="text-xs font-normal">{r.date}</span></div>
                <div className="text-sm text-right">
                  {r.totalSales === 0
                    ? <span className="italic">No sales</span>
                    : <>
                      Credit Due: KES {formatWhole(r.creditDue)} | Revenue: KES {formatWhole(r.totalRevenue)}
                      {canViewProfit && <> | Profit: KES {formatWhole(r.totalProfit)}</>}
                    </>
                  }
                </div>
              </div>
            ))}
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="mb-1 font-semibold text-slate-900">Week Totals</div>
              <div className="text-sm text-slate-700">Total Credit Due: KES {formatWhole(totals.totalCreditDue)}</div>
              <div className="text-sm text-slate-700">Total Revenue: KES {formatWhole(totals.totalRevenue)}</div>
              {canViewProfit && <div className="text-sm text-slate-700">Total Profit: KES {formatWhole(totals.totalProfit)}</div>}
            </div>
          </div>
      </section>
    </div>
  );
}
