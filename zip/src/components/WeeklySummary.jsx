import React from "react";

export default function WeeklySummary({ allSales = [], selectedDate }) {
  const endDate = selectedDate ? new Date(selectedDate) : new Date();

  // build 7-day window ending on selectedDate (inclusive)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - (6 - i));
    return d;
  });

  const rows = days.map(d => {
    const key = d.toLocaleDateString();
    const salesForDay = allSales.filter(s => new Date(s.timestamp).toLocaleDateString() === key);
    const totalSales = salesForDay.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const totalRevenue = salesForDay.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = salesForDay.reduce((sum, s) => sum + (s.profit || 0), 0);
    const creditGross = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.total || 0), 0);
    const creditDown = salesForDay.filter(s => s.isCreditSale).reduce((sum, s) => sum + (s.dwnPayment || 0), 0);
    const creditDue = creditGross - creditDown;
    return { date: key, totalSales, totalRevenue, totalProfit, creditDue };
  });

  const totals = rows.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.totalSales,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
    totalProfit: acc.totalProfit + r.totalProfit,
    totalCreditDue: acc.totalCreditDue + (r.creditDue || 0),
  }), { totalSales: 0, totalRevenue: 0, totalProfit: 0, totalCreditDue: 0 });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2 mt-4">7-Day Sales (ending {new Date(endDate).toLocaleDateString()})</h2>
      <div className="space-y-2">
        {[...rows].reverse().map((r, i) => (
          <div key={i} className="border p-3 rounded bg-gray-50 flex justify-between">
            <div>{r.date}</div>
            <div className="text-sm">Credit Due: KES {r.creditDue} | Revenue: KES {r.totalRevenue} | Profit: KES {r.totalProfit}</div>
          </div>
        ))}
        <div className="mt-3 p-3 border rounded bg-white">
          <div className="font-semibold">Week Totals</div>
          <div>Total Credit Due: KES {totals.totalCreditDue}</div>
          <div>Total Revenue: KES {totals.totalRevenue}</div>
          <div>Total Profit: KES {totals.totalProfit}</div>
        </div>
      </div>
    </div>
  );
}
