import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
import { useBusinessConfig } from "../config";

export default function Cart({ cart = [], onUpdateQty, onRemoveItem, onClearCart, onMakeSale }) {
  const { currentUser } = useAuth();
  const { config } = useBusinessConfig();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // FIX: guard against undefined qty / price so total never becomes NaN
  const cartTotal = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.sellingPrice) || 0),
      0
    );
  }, [cart]);

  const totalQty = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }, [cart]);

  const handleSale = async () => {
    if (cart.length === 0 || isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      await onMakeSale?.();
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden sticky top-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 text-white">
        <div>
          <h2 className="text-base font-bold leading-none">
            Orders {cart.length > 0 && `(${cart.length})`}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {totalQty === 0
              ? "No items yet"
              : `${totalQty} item${totalQty === 1 ? "" : "s"} • ${config?.businessName || ""}`}
          </p>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={onClearCart}
            className="text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-full transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto max-h-[52vh] lg:max-h-[58vh]">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center text-2xl">
              🍽️
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900">Cart is empty</p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Tap items to add it here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.map((item) => {
              const product = item.product || {};
              const qty = Number(item.qty) || 0;
              const price = Number(item.sellingPrice) || 0;
              const lineTotal = qty * price;

              return (
                <li key={product._id} className="px-4 py-3 flex gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug break-words">
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      KES {formatWhole(price)} each
                    </p>

                    {/* Nice - / + */}
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name}`}
                        onClick={() => qty > 1 && onUpdateQty?.(product._id, qty - 1)}
                        disabled={qty <= 1}
                        className={[
                          "w-12 h-12 rounded-full border flex items-center justify-center font-bold leading-none transition-all active:scale-90",
                          qty <= 1
                            ? "border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed"
                            : "border-slate-200 text-slate-700 bg-white hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50",
                        ].join(" ")}
                      >
                        −
                      </button>

                      <span className="min-w-12 text-center font-bold text-slate-900 tabular-nums">
                        {qty}
                      </span>

                      <button
                        type="button"
                        aria-label={`Increase ${product.name}`}
                        onClick={() => onUpdateQty?.(product._id, qty + 1)}
                        className="w-12 h-12 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 flex items-center justify-center text-lg font-bold leading-none transition-all active:scale-90"
                      >
                        +
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(product._id)}
                        className="ml-1 font-medium text-rose-500 hover:text-rose-700 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      KES {formatWhole(lineTotal)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      {cart.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3.5 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              KES {formatWhole(cartTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSale}
            disabled={isCheckingOut}
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm transition-all"
          >
            {isCheckingOut ? "Processing..." : `Make Order & Print • KES ${formatWhole(cartTotal)}`}
          </button>

          {currentUser?.username && (
            <p className="text-center text-[18px] text-slate-400">
              Served By: <span className="font-bold"> {currentUser.username} </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}