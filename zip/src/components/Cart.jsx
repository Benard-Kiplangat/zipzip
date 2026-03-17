import React from "react";

export default function Cart({ cart, onUpdateQty, onUpdatePrice, onRemoveItem, onClearCart, onMakeSale }) {
  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
  const cartProfit = cart.reduce((sum, item) => sum + item.qty * (item.sellingPrice - item.product.costPrice), 0);

  return (
    <div className="ml-4 p-4 border rounded bg-gray-50 w-72 flex flex-col gap-2 self-start sticky top-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Cart {cart.length > 0 && `(${cart.length})`}</h2>
        {cart.length > 0 && (
          <button
            onClick={onClearCart}
            className="text-red-500 text-sm hover:text-red-700 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Cart is empty</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
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

          <button
            onClick={onMakeSale}
            className="bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700 font-semibold w-full"
          >
            Make Bulk Sale ({cart.length} items)
          </button>
        </>
      )}
    </div>
  );
}
