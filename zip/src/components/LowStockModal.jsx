import React from "react";

export default function LowStockModal({ isOpen, onClose, lowStockProducts = [] }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <span>⚠️ Low Stock Spare Parts</span>
            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold">
              {lowStockProducts.length} items
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2.5 w-[60%]">Spare Part Name</th>
                <th className="py-2.5">Stock Left</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lowStockProducts.map((product) => {
                const isOut = Number(product.stock) <= 0;
                return (
                  <tr key={product._id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">{product.name}</td>
                    <td className={`py-2.5 font-bold ${isOut ? "text-rose-600" : "text-amber-600"}`}>
                      {product.stock} units
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isOut
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isOut ? "Out of Stock" : "Low Stock"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
