import React, { memo } from "react";

// New flat product:
// { _id: "product_...", type: "product", source, unit, name,
//   costPrice, sellingPrice, stock, lowStockThreshold, createdAt, updatedAt }
//
// Parent usage:
// <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
//   {products.map(p => (
//     <POSProductCard
//       key={p._id}
//       product={p}
//       cartQty={cart[p._id]?.quantity || 0}
//       onAddToCart={handleAddToCart}
//     />
//   ))}
// </div>

function POSProductCard({ product, cartQty = 0, onAddToCart }) {
  const handleClick = () => {
    // One click = add 1 to cart. Parent decides qty / price logic.
    // We pass the whole product so parent can use product.sellingPrice internally,
    // but we never show it here.
    onAddToCart?.(product);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "group relative flex min-h-[88px] w-full flex-col items-center justify-center",
        "rounded-2xl border bg-white px-3 py-4 text-center",
        "shadow-sm transition-all duration-150",
        "hover:border-orange-300 hover:shadow-md hover:-translate-y-0.5",
        "active:scale-[0.97] active:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1",
        cartQty > 0 ? "border-orange-400 bg-orange-50" : "border-slate-200",
      ].join(" ")}
    >

      {/* Product name - the only thing that matters here */}
      <span className="text-[15px] font-semibold leading-tight text-slate-900 line-clamp-3">
        {product.name}
      </span>
    </button>
  );
}

export default memo(POSProductCard);