import React, { useCallback, useMemo, useState } from "react";
import { db } from "../db";
import { showToast } from "../utils/toast";
import { usePOSData } from "../hooks/usePOSData";
import Cart from "../components/Cart";
import POSProductCard from "../components/POSProductCard";

export default function POS() {
  const {
    products,
    setProducts,
    search,
    setSearch,
    productIndex,
    loadingProducts,
    bumpPopular,
  } = usePOSData();

  // Cart is an ARRAY: [{ product, qty, sellingPrice }]
  const [cart, setCart] = useState([]);

  // Filter - default restaurant, missing source = others
  const [sourceFilter, setSourceFilter] = useState("restaurant");

  const normalizedProducts = useMemo(() => {
    return products.map((p) => ({
      ...p,
      _source: (p.source || "").toString().trim().toLowerCase() || "others",
    }));
  }, [products]);

  const sourceOptions = useMemo(() => {
    const counts = {};
    for (const p of normalizedProducts) {
      counts[p._source] = (counts[p._source] || 0) + 1;
    }
    const order = ["restaurant", "chomazone", "butchery", "shop", "grocery", "kitchen", "freezer", "others"];
    const sorted = Object.keys(counts).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return [
      { value: "all", label: "All", count: normalizedProducts.length },
      ...sorted.map((s) => ({ value: s, label: s, count: counts[s] })),
    ];
  }, [normalizedProducts]);

  const visibleProducts = useMemo(() => {
    if (sourceFilter === "all") return normalizedProducts;
    return normalizedProducts.filter((p) => p._source === sourceFilter);
  }, [normalizedProducts, sourceFilter]);

  // ONE handleAddToCart - array version only. Card calls it with just (product)
  const handleAddToCart = useCallback((product, options = {}) => {
    const qty = options.quantity || 1;
    const price = options.sellingPrice || product.sellingPrice;

    setCart((prev) => {
      const existing = prev.find((item) => item.product._id === product._id);
      if (existing) {
        return prev.map((item) =>
          item.product._id === product._id
            ? { ...item, qty: item.qty + qty, sellingPrice: price }
            : item
        );
      }
      return [...prev, { product, qty, sellingPrice: price }];
    });

    showToast(`${product.name} added to cart`);
  }, []);

  const handleCartUpdateQty = (productId, qty) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product._id === productId ? { ...item, qty: Math.max(1, qty) } : item
      )
    );
  };

  // These were missing - added
  const handleCartUpdatePrice = (productId, sellingPrice) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product._id === productId ? { ...item, sellingPrice } : item
      )
    );
  };

  const handleCartRemoveItem = (productId) => {
    setCart((prev) => prev.filter((item) => item.product._id !== productId));
  };

  const handleCartClear = () => setCart([]);

  // Execute Bulk Cart Sale
  const handleCartSale = async ({
    isCreditSale = false,
    customerName = "",
    dwnPayment = 0,
  } = {}) => {
    if (cart.length === 0) return;

    const bulkSaleId = new Date().toISOString();

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      const product = productIndex.get(item.product._id);
      if (!product) continue;
      const total = item.qty * item.sellingPrice;

      const sale = {
        _id: `sale_${bulkSaleId}-${i}`,
        type: "sale",
        productId: product._id,
        name: product.name,
        quantity: item.qty,
        total,
        sellingPrice: item.sellingPrice,
        timestamp: bulkSaleId,
        paymentHistory: [],
        isBulkSale: true,
        bulkSaleId,
      };

      await db.put(sale);

      const queuedSale = { ...sale, _id: `q${sale._id}` };
      await db.put(queuedSale);

      const updatedProduct = { ...product, stock: product.stock - item.qty };
      await db.put(updatedProduct);

      try {
        bumpPopular(product._id);
      } catch (e) {
        /* ignore */
      }
    }

    setCart([]);

    const soldQuantities = new Map(
      cart.map((item) => [item.product._id, Number(item.qty)])
    );
    setProducts((prev) => {
      let next = prev;
      for (const [productId, qty] of soldQuantities) {
        const index = next.findIndex((product) => product._id === productId);
        if (index === -1) continue;

        if (next === prev) next = [...prev];
        next[index] = {
          ...next[index],
          stock: Math.max(0, (Number(next[index].stock) || 0) - qty),
        };
      }
      return next;
    });
  };

  return (
    <div className="p-4 pb-8 flex flex-col lg:flex-row gap-6">
      {/* Mobile Cart Shortcut */}
      <button
        type="button"
        onClick={() => {
          document
            .getElementById("pos-cart")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="lg:hidden fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold"
      >
        Cart
        {cart.length > 0 && (
          <span className="bg-white text-blue-600 min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold">
            {cart.reduce((total, item) => total + (Number(item.qty) || 0), 0)}
          </span>
        )}
      </button>

      {/* Column 1: Search & Product Catalog */}
      <div className="flex-1 min-w-0 space-y-4">
        <input
          type="text"
          placeholder="Search products by name..."
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Source Filter Row */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {sourceOptions.map((opt) => {
            const isActive = sourceFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceFilter(opt.value)}
                className={[
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all",
                  "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                  isActive
                    ? "bg-orange-600 border-orange-600 text-white shadow"
                    : "bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-700",
                ].join(" ")}
              >
                <span className="capitalize">{opt.label}</span>
                <span
                  className={[
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Product Cards List */}
        <div className="grid gap-2 sm:gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {loadingProducts ? (
            <div className="col-span-full text-center py-10 bg-white border rounded-xl text-slate-400 text-sm">
              Products loading...
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="col-span-full text-center py-10 bg-white border rounded-xl text-slate-400 text-sm">
              No products found or still loading.
            </div>
          ) : (
            visibleProducts.map((product) => {
              return (
                <POSProductCard
                  key={product._id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Column 2: Cart Sidebar */}
      <div id="pos-cart" className="w-full lg:w-96 flex flex-col gap-4 flex-shrink-0">
        <Cart
          cart={cart}
          onUpdateQty={handleCartUpdateQty}
          onUpdatePrice={handleCartUpdatePrice}
          onRemoveItem={handleCartRemoveItem}
          onClearCart={handleCartClear}
          onMakeSale={handleCartSale}
        />
      </div>
    </div>
  );
}