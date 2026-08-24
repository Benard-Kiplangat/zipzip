import React, { useState } from "react";
import { formatWhole } from "../utils/format";

export default function POSProductCard({
  product,
  customers = [],
  onSell,
  onAddToCart,
}) {
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice);
  const [quantity, setQuantity] = useState(1);
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [downPayment, setDownPayment] = useState("");

  const currentPrice = Number(sellingPrice) || product.sellingPrice;
  const currentQty = Number(quantity) || 1;
  const totalPrice = currentQty * currentPrice;
  const totalProfit = totalPrice - product.costPrice * currentQty;
  const isOutOfStock = product.stock < 1;

  const handleSellClick = () => {
    onSell(product, {
      quantity: currentQty,
      sellingPrice: currentPrice,
      isCreditSale,
      customerName,
      downPayment: Number(downPayment) || 0,
    });
    // Reset local card state back to defaults
    setQuantity(1);
    setIsCreditSale(false);
    setCustomerName("");
    setDownPayment("");
  };

  const handleAddToCartClick = () => {
    onAddToCart(product, {
      quantity: currentQty,
      sellingPrice: currentPrice,
    });
  };

  return (
    <div className="border bg-white p-3 rounded-lg shadow-sm hover:shadow transition-shadow space-y-2">
      {/* Product Name & Stock Banner */}
      <div className="flex justify-between items-start gap-2">
        <div className="font-semibold text-slate-900 leading-snug">
          {product.name}
          <span
            className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
              isOutOfStock
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isOutOfStock ? "Out of Stock" : `${product.stock} remaining`}
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium whitespace-nowrap">
          Profit: KES {formatWhole(totalProfit)}
        </p>
      </div>

      {/* Inputs & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selling Price */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400">Price (KES)</span>
            <input
              type="number"
              className="w-24 h-8 text-sm border border-slate-300 rounded px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </div>

          {/* Quantity */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400">Qty</span>
            <input
              type="number"
              min="1"
              max={Math.max(1, product.stock)}
              disabled={isOutOfStock}
              className="w-16 h-8 text-sm border border-slate-300 rounded px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            />
          </div>

          {/* Credit Sale Checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer pt-3 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isCreditSale}
              onChange={(e) => setIsCreditSale(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            Credit
          </label>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-3">
          <button
            onClick={handleSellClick}
            disabled={isOutOfStock}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 h-8 rounded transition-colors whitespace-nowrap"
          >
            Sell (KES {formatWhole(totalPrice)})
          </button>
          <button
            onClick={handleAddToCartClick}
            disabled={isOutOfStock}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 h-8 rounded transition-colors whitespace-nowrap"
          >
            + Cart
          </button>
        </div>
      </div>

      {/* Credit Sale Extra Details */}
      {isCreditSale && (
        <div className="flex flex-wrap gap-2 items-center mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
          {customers.length > 0 && (
            <select
              className="border border-amber-300 p-1 text-xs rounded bg-white flex-1 min-w-[140px]"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            >
              <option value="">Select Customer...</option>
              {customers.map((c) => (
                <option key={c._id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            className="border border-amber-300 p-1 text-xs rounded bg-white flex-1 min-w-[140px]"
            placeholder="Or type Customer Name..."
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <input
            type="number"
            placeholder="Deposit (KES)"
            className="border border-amber-300 p-1 text-xs rounded bg-white w-28"
            value={downPayment}
            min="0"
            onChange={(e) => setDownPayment(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
