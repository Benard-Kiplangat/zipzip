import React from "react";
import { formatWhole } from "../utils/format";

export default function StockMetricsCard({
  totalCostValue = 0,
  totalSaleValue = 0,
  expectedProfit = 0,
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-1 gap-4">
      <div className="bg-white border xs:flex-col sm:flex sm:gap-3 sm:justify-around sm:flex-wrap border-slate-200 rounded-2xl p-4 shadow-sm space-y-1 sm:p-4">
        <div className="flex flex-col items-center justify-center gap-2 pt-1 mt-1">
        <div className="text-xs font-bold text-slate-500 uppercase lg:tracking-wider">
          Inventory Cost
        </div>
        <div className="text-xl font-black text-slate-900">
          {formatWhole(totalCostValue).toLocaleString()}
        </div>
        </div>
        <div className="hidden sm:flex flex-col items-center justify-center gap-2 pt-1">
          <div className="text-xs font-bold text-slate-500 uppercase">
          Retail Value
        </div>
        <div className="text-xl font-black text-slate-900">
          {formatWhole(totalSaleValue).toLocaleString()}
        </div>
        </div>
        <div className="hidden sm:flex flex-col items-center justify-center pt-1">
          <div className="text-xs font-bold text-slate-500 uppercase">
          Potential Profit
        </div>
        <div className="text-xl font-black text-slate-500">
          {formatWhole(expectedProfit).toLocaleString()}
        </div>
        </div>
      </div>

      <div className="sm:hidden flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
        <div className="text-xs font-bold text-slate-500 uppercase">
          Retail Value
        </div>
        <div className="text-xl font-black text-slate-900">
          {formatWhole(totalSaleValue).toLocaleString()}
        </div>
      </div>

      <div className="sm:hidden flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
        <div className="text-xs font-bold text-slate-500 uppercase">
          Potential Profit
        </div>
        <div className="text-xl font-black text-slate-900">
          {formatWhole(expectedProfit).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
