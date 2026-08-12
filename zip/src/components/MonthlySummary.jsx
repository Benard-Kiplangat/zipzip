import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

export default function MonthlySummary({ allSales = [], selectedDate }) {
  const { canViewProfit } = useAuth();
  const refDate = selectedDate ? new Date(selectedDate) : new Date();

  const { rows, totals } = useMemo(() => {
    const start = new Date(refDate.getFullYear(), refDate.getMonth() - 11, 1);
    const months = Array.from({ length: 12 }).map((_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));

    const salesByMonth = {};
    allSales.forEach(sale => {
      const sd = new Date(sale.timestamp);
      const key = `${sd.getFullYear()}-${sd.getMonth()}`;
      if (!salesByMonth[key]) salesByMonth[key] = [];
      salesByMonth[key].push(sale);
    });

    const rows = months.map(d => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const salesForMonth = salesByMonth[key] || [];
      const totalRevenue = salesForMonth.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalProfit = salesForMonth.reduce((sum, s) => sum + (s.profit || 0), 0);
      const creditGross = salesForMonth.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.total || 0), 0);
      const creditDown = salesForMonth.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.dwnPayment || 0), 0);
      const creditDue = creditGross - creditDown;
      const keyLabel = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      return { label: keyLabel, totalRevenue, totalProfit, creditDue };
    });

    const totals = rows.reduce((acc, r) => ({
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      totalProfit: acc.totalProfit + r.totalProfit,
      totalCreditDue: acc.totalCreditDue + (r.creditDue || 0),
    }), { totalRevenue: 0, totalProfit: 0, totalCreditDue: 0 });

    return { rows, totals };
  }, [allSales, refDate]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2 mt-4">Monthly Summary (previous 12 months ending {refDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })})</h2>
      <div className="space-y-2">
        {[...rows].reverse().map((r, i) => (
          <div key={i} className="border p-3 rounded bg-gray-50 flex justify-between">
            <div>{r.label}</div>
            <div className="text-sm">
              Credit Due: KES {formatWhole(r.creditDue)} | Revenue: KES {formatWhole(r.totalRevenue)}
              {canViewProfit && <> | Profit: KES {formatWhole(r.totalProfit)}</>}
            </div>
          </div>
        ))}
        <div className="mt-3 p-3 border rounded bg-white">
          <div className="font-semibold">12-Month Totals</div>
          <div>Total Credit Due: KES {formatWhole(totals.totalCreditDue)}</div>
          <div>Total Revenue: KES {formatWhole(totals.totalRevenue)}</div>
          {canViewProfit && <div>Total Profit: KES {formatWhole(totals.totalProfit)}</div>}
        </div>
      </div>
    </div>
  );
}
