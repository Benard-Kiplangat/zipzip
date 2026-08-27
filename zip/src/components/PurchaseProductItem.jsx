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
    <div className="border border-slate-200 p-3.5 rounded-xl flex items-start sm:items-center justify-between gap-3 bg-white shadow-2xs hover:border-slate-300 transition-colors">
      <div className="space-y-1">
        <div className="font-semibold flex flex-wrap gap-1 items-center text-slate-900 leading-snug"><span>{product.name}</span> <span className="text-xs font-normal py-1 text-slate-500">
            ({(product.stock || 0)})
          </span></div>
        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
          <span>Buy: Ksh {formatWhole(product.costPrice || 0)}</span>
          <span>Sell: Ksh {formatWhole(product.sellingPrice || 0)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-16 border border-slate-300 p-1.5 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
}
