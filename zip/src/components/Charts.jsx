import { Bar, Line } from "react-chartjs-2";
import { formatWhole } from "../utils/format";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

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

export default function Charts({ rows = [], selectedDate, period = "monthly" }) {
  const [chartType, setChartType] = useState("bar");
  const [dataSelection, setDataSelection] = useState("all");
  const [isExpanded, setIsExpanded] = useState(false);
  const { canViewProfit } = useAuth();

  const refDate = selectedDate ? new Date(selectedDate) : new Date();
  const isWeekly = period === "weekly";

  const chartRows = [...rows].sort(
    (a, b) => a.sortKey - b.sortKey
  );

  const allDatasets = [
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
      label: "Credit Sales",
      data: chartRows.map(row => row.creditValue),
      backgroundColor: "rgba(245, 158, 11, 0.78)",
      hoverBackgroundColor: "rgb(217, 119, 6)",
      borderColor: "rgb(245, 158, 11)",
      borderRadius: 6,
      borderSkipped: false,
    },
  ];
  const selectionDatasets = {
    all: ["Revenue", "Profit", "Credit Sales"],
    revenueProfit: ["Revenue", "Profit"],
    revenueCredit: ["Revenue", "Credit Sales"],
    credit: ["Credit Only"],
    profit: ["Profit"],
    revenue: ["Revenue"],
  };

  const chartData = {
    labels: chartRows.map(row => row.label),
    datasets: allDatasets.filter(dataset =>
      (selectionDatasets[dataSelection] || selectionDatasets.all).includes(dataset.label)
    ),
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
  const dataOptions = [
    { id: "all", label: "All data" },
    ...(canViewProfit ? [{ id: "revenueProfit", label: "Revenue + profit" }] : []),
    { id: "revenueCredit", label: "Revenue + credit" },
    { id: "revenue", label: "Revenue only" },
    ...(canViewProfit ? [{ id: "profit", label: "Profit only" }] : []),
    { id: "credit", label: "Credit only" },
  ];

  const chartOptions = axisOptions;

  return (
    <div className={`${isExpanded ? "fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-3 sm:p-6" : ""}`}>
      <div className={`mx-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${isExpanded ? "min-h-[calc(100vh-1.5rem)] max-w-7xl sm:min-h-[calc(100vh-3rem)]" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">
            {isWeekly ? "Weekly Summary" : "Monthly Summary"}
          </h2>
          <div className="flex items-center gap-2">
          <label htmlFor="chart-type" className="sr-only">
            Chart type
          </label>
          <select
            id="chart-type"
            value={chartType}
            onChange={e => setChartType(e.target.value)}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {chartTypes.map(type => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <label htmlFor="chart-data" className="sr-only">
            Data to visualize
          </label>
          <select
            id="chart-data"
            value={dataSelection}
            onChange={e => setDataSelection(e.target.value)}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {dataOptions.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsExpanded(expanded => !expanded)}
            aria-expanded={isExpanded}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isExpanded ? "Exit full view" : "Expand chart"}
          </button>
        </div>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Revenue, credit due{canViewProfit ? " and profit" : ""} · Previous{" "}
            {isWeekly ? "7 days ending" : "12 months ending"}{" "}
            {refDate.toLocaleString(
              undefined,
              isWeekly
                ? { day: "numeric", month: "long", year: "numeric" }
                : { month: "long", year: "numeric" }
            )}
          </p>
        </div>
      </div>

      <div className={`rounded-xl bg-slate-50/80 p-2 sm:p-4 ${isExpanded ? "h-[calc(100vh-12rem)] min-h-[360px]" : "h-[320px]"}`}>
        {chartType === "bar" && <Bar data={chartData} options={chartOptions} />}
        {chartType === "line" && <Line data={lineData} options={chartOptions} />}
      </div>
    </div>
    </div>
  )
}