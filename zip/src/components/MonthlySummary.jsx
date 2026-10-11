import React, { useMemo, useState } from "react";
import Charts from "./Charts"
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

function computeCreditSalesValue(salesForPeriod){
  let creditSalesValue = salesForPeriod.filter(sale => sale.isCreditSale).reduce((sum, sale) => sum + sale.total, 0);
  return creditSalesValue;
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
    const bulkTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const initialDwn = Number(
      first.initialBulkDwnPayment ??
      first.bulkDwnPayment ??
      first.dwnPayment ??
      0
    );
    const paymentHistory = Array.isArray(first.paymentHistory) ? first.paymentHistory : [];
    const historyPaid = paymentHistory.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    due += Math.max(0, bulkTotal - initialDwn - historyPaid);
  });

  normalSales.forEach(sale => {
    const total = Number(sale.total || 0);
    const initialDwn = Number(sale.initialDwnPayment ?? sale.dwnPayment ?? 0);
    const paymentHistory = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
    const historyPaid = paymentHistory.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    due += Math.max(0, total - initialDwn - historyPaid);
  });

  return due;
}

export default function MonthlySummary({ allSales = [], selectedDate }) {
  const { canViewProfit } = useAuth();
  const refDate = selectedDate ? new Date(selectedDate) : new Date();
  
  const { rows, totals } = useMemo(() => {
    const start = new Date(refDate.getFullYear(), refDate.getMonth() - 11, 1);
    const months = Array.from({ length: 12 }, (_, index) =>
      new Date(start.getFullYear(), start.getMonth() + index, 1)
    );

    const salesByMonth = {};
    allSales.forEach(sale => {
      const saleDate = new Date(sale.timestamp);
      const key = `${saleDate.getFullYear()}-${saleDate.getMonth()}`;
      if (!salesByMonth[key]) salesByMonth[key] = [];
      salesByMonth[key].push(sale);
    });

    const rows = months.map(date => {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const salesForMonth = salesByMonth[key] || [];
      const totalRevenue = salesForMonth.reduce((sum, sale) => sum + (sale.total || 0), 0);
      const totalProfit = salesForMonth.reduce((sum, sale) => sum + (sale.profit || 0), 0);
      const creditDue = computeCreditDue(salesForMonth);
      const creditValue = salesForMonth.filter(sale => sale.isCreditSale).reduce((sum, sale) => sum + (sale.total || 0), 0);

      return {
        sortKey: date.getTime(),
        label: date.toLocaleString(undefined, { month: "short", year: "numeric" }),
        totalRevenue,
        totalProfit,
        creditDue,
        creditValue,
      };
    });

    const totals = rows.reduce((acc, row) => ({
      totalRevenue: acc.totalRevenue + row.totalRevenue,
      totalProfit: acc.totalProfit + row.totalProfit,
      totalCreditDue: acc.totalCreditDue + row.creditDue,
      totalCreditValue: acc.totalCreditValue + row.creditValue,
    }), { totalRevenue: 0, totalProfit: 0, totalCreditDue: 0, totalCreditValue: 0 });

    return { rows, totals };
  }, [allSales, refDate]);

  return (
    <div className="">
      <section>
        <Charts rows={rows} selectedDate={selectedDate} period="monthly"/>
          <div className="mt-5 space-y-2">
            {[...rows].sort((a, b) => b.sortKey - a.sortKey).map((r, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="font-medium text-slate-800">{r.label}</div>
                <div className="text-sm text-slate-600">
                  Credit Due: KES {formatWhole(r.creditDue)} | Revenue: KES {formatWhole(r.totalRevenue)}
                  {canViewProfit && <> | Profit: KES {formatWhole(r.totalProfit)}</>}
                </div>
              </div>
            ))}
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="mb-1 font-semibold text-slate-900">12-Month Totals</div>
              <div className="text-sm text-slate-700">Total Credit Due: KES {formatWhole(totals.totalCreditDue)}</div>
              <div className="text-sm text-slate-700">Total Revenue: KES {formatWhole(totals.totalRevenue)}</div>
              {canViewProfit && <div className="text-sm text-slate-700">Total Profit: KES {formatWhole(totals.totalProfit)}</div>}
            </div>
          </div>
      </section>
    </div>
  );
}
