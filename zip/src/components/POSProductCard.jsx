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
            className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${isOutOfStock
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-600"
              }`}
          >
            {isOutOfStock ? "Out of Stock" : `${product.stock} remaining`}
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium whitespace-nowrap">
          Total: Ksh {totalPrice.toLocaleString()} ( profit = {formatWhole(totalProfit)} )
        </p>
      </div>
      {/* Selling controls */}
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-1.5 space-y-1.5 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 items-end">
          <label className="text-xs text-slate-500 font-semibold">
            Price (Ksh)
            <input
              type="number"
              min="0"
              step="10"
              placeholder="Price"
              className="input-field mt-0.5 text-sm py-1.5"
              value={sellingPrice ?? product.sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500 font-semibold">
            Quantity
            <input
              type="number"
              min="1"
              step="1"
              max={Math.max(1, product.stock)}
              disabled={isOutOfStock}
              value={quantity ?? 1}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
              className="input-field mt-0.5 text-sm py-1.5"
            />
          </label>
        </div>
        {/* Customer / credit details only when needed */}
        {isCreditSale && (
          <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
            <label className="text-xs text-slate-500 font-semibold">
              Customer
              <select
                className="input-field mt-0.5 text-xs py-1"
                value={customerName ?? ""}
                onChange={(e) => setCustomerName(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map(customer => (
                  <option key={customer._id} value={customer.name}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500 font-semibold">
              New Customer
              <input
                type="text"
                placeholder="Enter new customer's name..."
                className="input-field mt-0.5 text-xs py-1"
                value={customerName ?? ""}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500 font-semibold">
              Deposit
              <input
                type="number"
                min="0"
                placeholder="Down Payment"
                className="input-field mt-0.5 text-xs py-1 px-2"
                value={downPayment ?? ""}
                onChange={(e) => setDownPayment(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11px] text-slate-600 bg-emerald-50 border border-slate-200 px-2 py-1 rounded-md cursor-pointer">
              <input
                type="checkbox"
                checked={isCreditSale ?? false}
                onChange={(e) => setIsCreditSale(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Credit</span>
            </label>
          </div>
          <div className="text-right">
            <div className="flex gap-2 items-center justify-end">
              <button
                onClick={handleSellClick}
                disabled={isOutOfStock}
                className="btn-primary text-xs py-1 px-3"
              >
                Quick Sell
              </button>
              <button
                onClick={handleAddToCartClick}
                disabled={isOutOfStock}
                className="btn-secondary text-xs py-1 px-3"
              >
                + Cart
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
