import React, { useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartType, setChartType] = useState("bar");
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

      return {
        label: date.toLocaleString(undefined, { month: "short", year: "numeric" }),
        totalRevenue,
        totalProfit,
        creditDue,
      };
    });

    const totals = rows.reduce((acc, row) => ({
      totalRevenue: acc.totalRevenue + row.totalRevenue,
      totalProfit: acc.totalProfit + row.totalProfit,
      totalCreditDue: acc.totalCreditDue + row.creditDue,
    }), { totalRevenue: 0, totalProfit: 0, totalCreditDue: 0 });

    return { rows, totals };
  }, [allSales, refDate]);

  const chartRows = [...rows];
  const chartData = {
    labels: chartRows.map(row => row.label),
    datasets: [
      {
        label: "Revenue",
        data: chartRows.map(row => row.totalRevenue),
        backgroundColor: "rgba(37, 99, 235, 0.78)",
        hoverBackgroundColor: "rgb(29, 78, 216)",
        borderColor: "rgb(37, 99, 235)",
        borderRadius: 6,
        borderSkipped: false,
      },
      ...(canViewProfit ? [{
        label: "Profit",
        data: chartRows.map(row => row.totalProfit),
        backgroundColor: "rgba(16, 185, 129, 0.78)",
        hoverBackgroundColor: "rgb(5, 150, 105)",
        borderColor: "rgb(16, 185, 129)",
        borderRadius: 6,
        borderSkipped: false,
      }] : []),
      {
        label: "Credit due",
        data: chartRows.map(row => row.creditDue),
        backgroundColor: "rgba(245, 158, 11, 0.78)",
        hoverBackgroundColor: "rgb(217, 119, 6)",
        borderColor: "rgb(245, 158, 11)",
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const lineData = {
    ...chartData,
    datasets: chartData.datasets.map(dataset => ({
      ...dataset,
      backgroundColor: dataset.borderColor,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.35,
    })),
  };

  const axisOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          padding: 20,
          color: "#475569",
          font: { family: "inherit", size: 12 },
        },
      },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 12,
        cornerRadius: 10,
        titleColor: "#f8fafc",
        bodyColor: "#e2e8f0",
        callbacks: {
          label: context =>
            ` ${context.dataset.label}: KES ${formatWhole(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: "#64748b",
          maxRotation: 0,
          autoSkip: false,
          font: { size: 10 },
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false, dash: [4, 4] },
        grid: { color: "rgba(148, 163, 184, 0.18)" },
        ticks: {
          color: "#64748b",
          callback: value => `KES ${Number(value).toLocaleString()}`,
        },
      },
    },
  };

  const chartTypes = [
    { id: "bar", label: "Bar" },
    { id: "line", label: "Line" },
  ];

  const chartOptions = axisOptions;

  return (
    <div className={isExpanded ? "fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-3 sm:p-6" : ""}>
      <section className={`mx-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${isExpanded ? "min-h-[calc(100vh-1.5rem)] max-w-7xl sm:min-h-[calc(100vh-3rem)]" : ""}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Monthly Summary</h2>
            <p className="mt-1 text-sm text-slate-500">
              Revenue, credit due{canViewProfit ? " and profit" : ""} · Previous 12 months ending{" "}
              {refDate.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Bar
          </button>
          <button
            type="button"
            onClick={() => setChartType("line")}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Line  
          </button>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(expanded => !expanded)}
            aria-expanded={isExpanded}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isExpanded ? "Exit full view" : "Expand chart"}
          </button>
        </div>

        <div className={`rounded-xl bg-slate-50/80 p-2 sm:p-4 ${isExpanded ? "h-[calc(100vh-12rem)] min-h-[360px]" : "h-[320px]"}`}>
          {chartType === "bar" && <Bar data={chartData} options={chartOptions} />}
          {chartType === "line" && <Line data={lineData} options={chartOptions} />}
        </div>

        {!isExpanded && (
          <div className="mt-5 space-y-2">
            {[...rows].reverse().map((r, i) => (
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
        )}
      </section>
    </div>
  );
}
