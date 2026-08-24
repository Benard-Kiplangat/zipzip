import React from "react";
import { formatWhole } from "../utils/format";

export default function PurchaseHistoryCard({
  metrics,
  filteredPurchases = [],
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}) {
  return (
    <aside className="space-y-4 w-full">
      {/* Metrics Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center justify-between">
          <span>📜 Purchase Overview</span>
        </h2>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
            <div className="text-slate-500 font-medium">Today</div>
            <div className="font-bold text-slate-900">KES {formatWhole(metrics.todayTotal)}</div>
            <div className="text-[10px] text-slate-400">{metrics.todayCount} items</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
            <div className="text-slate-500 font-medium">This Week</div>
            <div className="font-bold text-slate-900">KES {formatWhole(metrics.weekTotal)}</div>
            <div className="text-[10px] text-slate-400">{metrics.weekCount} items</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
            <div className="text-slate-500 font-medium">This Month</div>
            <div className="font-bold text-slate-900">KES {formatWhole(metrics.monthTotal)}</div>
            <div className="text-[10px] text-slate-400">{metrics.monthCount} items</div>
          </div>
        </div>
      </div>

      {/* Date Filter & Recent Purchase Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">Date Range Filter</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-slate-200 p-1.5 rounded-lg text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-slate-200 p-1.5 rounded-lg text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <h3 className="text-sm font-bold text-slate-900 pt-2 border-t border-slate-100 flex justify-between items-center">
          <span>Recent Purchases</span>
          <span className="text-xs font-normal text-slate-500">
            {filteredPurchases.length} logged
          </span>
        </h3>

        {filteredPurchases.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">
            No purchases logged within selected dates.
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {filteredPurchases.map((purchase) => (
              <div
                key={purchase._id}
                className="rounded-xl border border-slate-100 p-2.5 bg-slate-50 text-xs space-y-1 hover:border-slate-200 transition-colors"
              >
                <div className="font-bold text-slate-900 flex justify-between items-center">
                  <span>{purchase.name}</span>
                  <span className="text-emerald-600 font-bold">
                    KES {formatWhole(purchase.totalCost || 0)}
                  </span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>
                    {purchase.quantity} units @ KES {formatWhole(purchase.costPrice || 0)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(purchase.date).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
