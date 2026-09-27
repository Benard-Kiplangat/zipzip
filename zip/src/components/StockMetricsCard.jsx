import React from "react";
import { formatWhole } from "../utils/format";

export default function StockMetricsCard({
  totalCostValue = 0,
  totalSaleValue = 0,
  expectedProfit = 0,
}) {
  return (
    <aside className="space-y-4 w-full">
          {/* Metrics Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center justify-between">
              <span>Stock Overview</span>
            </h2>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
                <div className="text-slate-500 font-medium">Inventory Cost</div>
                <div className="font-bold text-slate-900">Ksh. {formatWhole(totalCostValue).toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
                <div className="text-slate-500 font-medium">Retail Value</div>
                <div className="font-bold text-slate-900">Ksh. {formatWhole(totalSaleValue).toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-0.5">
                <div className="text-slate-500 font-medium">Potential Profit</div>
                <div className="font-bold text-slate-900">Ksh. {formatWhole(expectedProfit).toLocaleString()}</div>
              </div>
            </div>
    </div>
    </aside>
  );
}
