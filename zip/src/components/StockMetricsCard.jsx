import React from "react";
import { formatWhole } from "../utils/format";

export default function StockMetricsCard({
  totalCostValue = 0,
  totalSaleValue = 0,
  expectedProfit = 0,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Total Inventory Cost
        </div>
        <div className="text-xl sm:text-2xl font-black text-slate-900">
          KES {formatWhole(totalCostValue).toLocaleString()}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Total Retail Value
        </div>
        <div className="text-xl sm:text-2xl font-black text-blue-600">
          KES {formatWhole(totalSaleValue).toLocaleString()}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Est. Potential Profit
        </div>
        <div className="text-xl sm:text-2xl font-black text-emerald-600">
          KES {formatWhole(expectedProfit).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
