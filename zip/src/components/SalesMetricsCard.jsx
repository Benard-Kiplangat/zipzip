import React from "react";
import { formatWhole } from "../utils/format";

export default function SalesMetricsCard({ summary, canViewProfit }) {
  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Revenue
          </p>
          <p className="mt-1 truncate text-base sm:text-lg font-extrabold text-slate-900">
            KES {formatWhole(summary.totalRevenue)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Dues Owed
          </p>
          <p className="mt-1 truncate text-base sm:text-lg font-extrabold text-amber-600">
            KES {formatWhole(summary.totalCreditSales)}
          </p>
        </div>

        {canViewProfit && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Profit
            </p>
            <p className="mt-1 truncate text-base sm:text-lg font-extrabold text-emerald-600">
              KES {formatWhole(summary.totalProfit)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
