import React, { useState } from "react";
import { formatWhole } from "../utils/format";

export default function CreditSaleItem({
  sale,
  paymentInfo,
  onAddPayment,
  onEditSale,
  onDeleteSaleWithStockRestore,
}) {
  const [paymentAmount, setPaymentAmount] = useState("");

  const handleAddPaymentClick = () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;
    onAddPayment(sale, amount);
    setPaymentAmount("");
  };

  return (
    <div className="border border-amber-300 bg-amber-50/50 rounded-2xl p-3.5 space-y-2 text-xs">
      <div className="flex justify-between items-start">
        <div>
          {sale.customerName && (
            <span className="font-bold text-amber-900 text-sm block">
              Customer: {sale.customerName}
            </span>
          )}
          <div className="font-semibold text-slate-900 text-sm">
            {sale.quantity} × {sale.name}
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            paymentInfo.balance <= 0
              ? "bg-emerald-100 text-emerald-800"
              : paymentInfo.paid > 0
              ? "bg-amber-100 text-amber-800"
              : "bg-rose-100 text-rose-800"
          }`}
        >
          {paymentInfo.balance <= 0
            ? "PAID"
            : paymentInfo.paid > 0
            ? "PARTIALLY PAID"
            : "UNPAID"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-amber-200">
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase">Total</div>
          <div className="font-bold text-slate-900">KES {formatWhole(paymentInfo.total)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase">Paid</div>
          <div className="font-bold text-emerald-600">KES {formatWhole(paymentInfo.paid)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase">Balance</div>
          <div
            className={`font-bold ${
              paymentInfo.balance > 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            KES {formatWhole(paymentInfo.balance)}
          </div>
        </div>
      </div>

      {paymentInfo.paymentHistory.length > 0 && (
        <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-100">
          <div className="font-bold text-slate-700 text-[11px]">Payment History</div>
          {paymentInfo.paymentHistory.map((entry, index) => (
            <div key={index} className="flex justify-between text-[11px] text-slate-600">
              <span>
                {new Date(entry.date).toLocaleDateString()} ({entry.method || "cash"})
              </span>
              <span className="font-bold text-emerald-600">
                KES {Number(entry.amount || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {paymentInfo.balance > 0 && (
        <div className="flex gap-2 pt-1">
          <input
            type="number"
            min="1"
            max={paymentInfo.balance}
            placeholder={`Add payment (max KES ${paymentInfo.balance})`}
            className="border border-slate-300 rounded-lg p-1.5 flex-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
          <button
            onClick={handleAddPaymentClick}
            disabled={!paymentAmount}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
          >
            Add Payment
          </button>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-amber-200">
        <button
          onClick={() => onEditSale(sale)}
          className="text-emerald-700 hover:underline font-bold"
        >
          Edit
        </button>
        <button
          onClick={() => onDeleteSaleWithStockRestore(sale)}
          className="text-blue-700 hover:underline font-bold"
        >
          Delete & Restore Stock
        </button>
      </div>
    </div>
  );
}
