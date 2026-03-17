import React, { useState } from "react";

export default function Cart({ cart, onUpdateQty, onUpdatePrice, onRemoveItem, onClearCart, onMakeSale }) {
  const [isCredit, setIsCredit] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [dwnPayment, setDwnPayment] = useState(0);

  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
  const cartProfit = cart.reduce((sum, item) => sum + item.qty * (item.sellingPrice - item.product.costPrice), 0);
  const amountOwed = cartTotal - dwnPayment;

  const handleSale = () => {
    onMakeSale({ isCreditSale: isCredit, customerName, dwnPayment: Number(dwnPayment) });
  };

  const handleClear = () => {
    setIsCredit(false);
    setCustomerName("");
    setDwnPayment(0);
    onClearCart();
  };

  return (
    <div className="ml-4 p-4 border rounded bg-gray-50 w-72 flex flex-col gap-2 self-start sticky top-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Cart {cart.length > 0 && `(${cart.length})`}</h2>
        {cart.length > 0 && (
          <button onClick={handleClear} className="text-red-500 text-sm hover:text-red-700 font-medium">
            Clear All
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Cart is empty</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
            {cart.map(item => (
              <div key={item.product._id} className="border rounded p-2 bg-white">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm leading-tight">{item.product.name}</span>
                  <button
                    onClick={() => onRemoveItem(item.product._id)}
                    className="text-red-400 text-sm hover:text-red-600 ml-1 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  <label className="text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    min="1"
                    className="border p-1 w-12 rounded text-sm"
                    value={item.qty}
                    onChange={e => onUpdateQty(item.product._id, parseInt(e.target.value) || 1)}
                  />
                  <label className="text-xs text-gray-500">@</label>
                  <input
                    type="number"
                    className="border p-1 w-16 rounded text-sm"
                    value={item.sellingPrice}
                    onChange={e => onUpdatePrice(item.product._id, parseInt(e.target.value) || 0)}
                  />
                  <span className="text-sm font-semibold">= {item.qty * item.sellingPrice}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Profit: KES {item.qty * (item.sellingPrice - item.product.costPrice)} | Stock: {item.product.stock}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-2 space-y-1">
            <div className="text-sm font-bold">Total: KES {cartTotal}</div>
            <div className="text-sm text-gray-600">Total Profit: KES {cartProfit}</div>
          </div>

          <div className="border rounded p-2 bg-white space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isCredit}
                onChange={e => {
                  setIsCredit(e.target.checked);
                  if (!e.target.checked) { setCustomerName(""); setDwnPayment(0); }
                }}
              />
              <span className="text-sm font-medium text-red-700">Credit Sale?</span>
            </label>

            {isCredit && (
              <div className="space-y-2 pt-1 border-t">
                <input
                  type="text"
                  placeholder="Customer name (required)"
                  className="w-full border p-1.5 rounded text-sm"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Down payment"
                  className="w-full border p-1.5 rounded text-sm"
                  value={dwnPayment}
                  min="0"
                  onChange={e => setDwnPayment(e.target.value)}
                />
                {dwnPayment > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    Owes after payment: KES {Math.max(0, amountOwed)}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSale}
            className={`text-white px-3 py-2 rounded font-semibold w-full ${isCredit ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}`}
          >
            {isCredit ? "Make Bulk Credit Sale" : "Make Bulk Sale"} ({cart.length} items)
          </button>
        </>
      )}
    </div>
  );
}
