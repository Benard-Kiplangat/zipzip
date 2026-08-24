import React, { useState } from "react";
import { formatWhole } from "../utils/format";

export default function PurchaseProductItem({ product, canViewStock, onAddStock }) {
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    const qty = Number(quantity) || 1;
    setIsSubmitting(true);
    try {
      await onAddStock(product._id, qty);
      setQuantity(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-slate-200 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white shadow-2xs hover:border-slate-300 transition-colors">
      <div className="space-y-1">
        <div className="font-semibold text-slate-900 leading-snug">{product.name}</div>
        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
            Stock: {canViewStock ? (product.stock || 0) : "Hidden"}
          </span>
          <span>Buy: <strong className="text-slate-800">KES {formatWhole(product.costPrice || 0)}</strong></span>
          <span>•</span>
          <span>Sell: <strong className="text-slate-800">KES {formatWhole(product.sellingPrice || 0)}</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 border border-slate-300 p-1.5 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {isSubmitting ? "Adding..." : "+ Add Stock"}
        </button>
      </div>
    </div>
  );
}
