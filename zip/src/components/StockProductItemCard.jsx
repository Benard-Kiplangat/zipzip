import React, { useState } from "react";
import { formatWhole } from "../utils/format";

export default function StockProductItemCard({ product, onEdit, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const cost = Number(product.costPrice) || 0;
  const sell = Number(product.sellingPrice) || 0;
  const margin = sell - cost;
  const stock = Number(product.stock) || 0;
  const threshold = product.lowStockThreshold != null ? Number(product.lowStockThreshold) : 2;
  const isLowStock = stock <= threshold;
  const isOutOfStock = stock <= 0;

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-2xs hover:border-slate-300 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900 text-sm leading-snug">
            {product.name}
          </span>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              isOutOfStock
                ? "bg-rose-100 text-rose-700"
                : isLowStock
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {isOutOfStock
              ? "Out of Stock"
              : isLowStock
              ? `Low Stock (${stock} left)`
              : `${stock} units`}
          </span>
        </div>

        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
          <span>
            Buy: <strong className="text-slate-800">KES {formatWhole(cost)}</strong>
          </span>
          <span>•</span>
          <span>
            Sell: <strong className="text-slate-800">KES {formatWhole(sell)}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-600 font-bold">
            Margin: KES {formatWhole(margin)}
          </span>
          {product.lowStockThreshold != null && (
            <span className="text-amber-700 text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Alert threshold: {product.lowStockThreshold}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {!showConfirm ? (
          <>
            <button
              onClick={() => onEdit(product)}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 p-1 rounded-lg">
            <span className="text-[11px] font-bold text-rose-700">Delete?</span>
            <button
              onClick={() => {
                onDelete(product);
                setShowConfirm(false);
              }}
              className="text-[11px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded hover:bg-rose-700"
            >
              Yes
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="text-[11px] text-slate-600 px-1 hover:text-slate-800"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
