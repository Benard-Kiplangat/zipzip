import React from "react";

export default function CustomerDebtsCard({ customerCredits = [], grandCreditTotal = 0 }) {
  if (customerCredits.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm space-y-3">
      <h2 className="text-base font-bold text-amber-900 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span>📋</span> Customer Debts
        </span>
        <span className="bg-amber-200 text-amber-900 text-xs px-2.5 py-1 rounded-full font-bold">
          KES {grandCreditTotal.toLocaleString()}
        </span>
      </h2>

      <div className="space-y-2 max-h-[350px] px-0.5 overflow-y-auto">
        {customerCredits.map((customer) => (
          <div
            key={customer.name}
            className="bg-white border border-amber-200 rounded-xl p-3 text-xs space-y-1.5 shadow-2xs"
          >
            <div className="font-bold text-slate-900 flex justify-between items-center">
              <span>{customer.name}</span>
              <span className="text-[11px] text-slate-500 font-normal">
                {customer.date ? new Date(customer.date).toLocaleDateString() : "N/A"}
              </span>
            </div>

            <div className="space-y-1">
              {customer.entries.map((e, i) => (
                <div key={i} className="text-slate-600 flex justify-between">
                  <span>{e.label}</span>
                  <span className="font-medium">KES {e.owed.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <hr className="border-amber-100" />
            <div className="flex justify-between items-center pt-1 text-rose-600 font-bold">
              <span>Total Owed:</span>
              <span>KES {customer.totalOwed.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
