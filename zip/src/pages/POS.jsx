import React, { useState } from "react";
import { db } from "../db";
import { showToast } from "../utils/toast";
import { formatWhole } from "../utils/format";
import { usePOSData } from "../hooks/usePOSData";
import Cart from "../components/Cart";
import POSProductCard from "../components/POSProductCard";
import CustomerDebtsCard from "../components/CustomerDebtsCard";
import LowStockModal from "../components/LowStockModal";

export default function POS() {
  const {
    products,
    setProducts,
    search,
    setSearch,
    customers,
    productIndex,
    visibleProducts,
    lowStockProducts,
    customerCredits,
    grandCreditTotal,
    setOutstandingCredits,
    bumpPopular,
  } = usePOSData();

  const [cart, setCart] = useState([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  // Single Item Sale
  const handleSell = async (product, options) => {
    const qty = options.quantity || 1;
    const price = options.sellingPrice || product.sellingPrice;
    const isCreditSale = options.isCreditSale || false;
    const customerName = (options.customerName || "").trim();
    const initialPayment = options.downPayment || 0;

    if (product.stock < qty) {
      alert("Not enough stock");
      return;
    }

    if (isCreditSale && !customerName) {
      alert("Please enter the customer's name for a credit sale.");
      return;
    }

    const total = qty * price;
    const profit = total - product.costPrice * qty;

    const sale = {
      _id: new Date().toISOString(),
      type: "sale",
      name: product.name,
      quantity: qty,
      total,
      costPrice: product.costPrice,
      sellingPrice: price,
      profit,
      timestamp: new Date().toISOString(),
      isCreditSale,
      dwnPayment: initialPayment,
      paymentHistory: [],
      customerName: isCreditSale ? customerName : "",
    };

    const updatedProduct = { ...product, stock: product.stock - qty };

    await db.put(sale);
    await db.put(updatedProduct);

    setProducts((prev) =>
      prev.map((item) =>
        item._id === product._id
          ? { ...item, stock: Math.max(0, (Number(item.stock) || 0) - qty) }
          : item
      )
    );

    if (isCreditSale) {
      setOutstandingCredits((prev) => [
        {
          _id: sale._id,
          type: "sale",
          name: sale.name,
          quantity: sale.quantity,
          total: sale.total,
          customerName: sale.customerName,
          dwnPayment: sale.dwnPayment,
          timestamp: sale.timestamp,
          isCreditSale: true,
        },
        ...prev,
      ]);
    }

    showToast(`Sold ${qty} x ${product.name} — KES ${formatWhole(total)}`);
    try {
      bumpPopular(product._id);
    } catch (e) {
      /* ignore */
    }
  };

  // Add Item to Cart
  const handleAddToCart = (product, options = {}) => {
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
  };

  const handleCartUpdateQty = (productId, qty) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product._id === productId ? { ...item, qty: Math.max(1, qty) } : item
      )
    );
  };

  const handleCartUpdatePrice = (productId, price) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product._id === productId ? { ...item, sellingPrice: price } : item
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

    if (isCreditSale && !customerName.trim()) {
      alert("Please enter the customer's name for a credit sale.");
      return;
    }

    for (const item of cart) {
      const current = productIndex.get(item.product._id);
      if (!current || current.stock < item.qty) {
        alert(
          `Not enough stock for "${item.product.name}" (${current?.stock ?? 0} remaining)`
        );
        return;
      }
    }

    const bulkSaleId = new Date().toISOString();

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      const product = productIndex.get(item.product._id);
      const total = item.qty * item.sellingPrice;
      const profit = total - product.costPrice * item.qty;

      const sale = {
        _id: `${bulkSaleId}-${i}`,
        type: "sale",
        name: product.name,
        quantity: item.qty,
        total,
        costPrice: product.costPrice,
        sellingPrice: item.sellingPrice,
        profit,
        timestamp: bulkSaleId,
        isCreditSale,
        customerName: isCreditSale ? customerName.trim() : "",
        dwnPayment: 0,
        paymentHistory: [],
        bulkDwnPayment: isCreditSale ? Number(dwnPayment) : 0,
        isBulkSale: true,
        bulkSaleId,
      };

      await db.put(sale);

      const updatedProduct = { ...product, stock: product.stock - item.qty };
      await db.put(updatedProduct);

      try {
        bumpPopular(product._id);
      } catch (e) {
        /* ignore */
      }
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
    setCart([]);

    setProducts((prev) =>
      prev.map((product) => {
        const cartItem = cart.find((item) => item.product._id === product._id);
        if (!cartItem) return product;
        return {
          ...product,
          stock: Math.max(0, (Number(product.stock) || 0) - cartItem.qty),
        };
      })
    );

    if (isCreditSale) {
      const nextCreditEntry = {
        isBulkGroup: true,
        bulkSaleId,
        customerName: customerName.trim(),
        dwnPayment: Number(dwnPayment),
        timestamp: bulkSaleId,
        items: cart.map((item) => ({
          _id: `${bulkSaleId}-${item.product._id}`,
          name: item.product.name,
          quantity: item.qty,
          total: item.qty * item.sellingPrice,
          customerName: customerName.trim(),
        })),
      };
      setOutstandingCredits((prev) => [nextCreditEntry, ...prev]);
    }

    const creditNote = isCreditSale ? ` (Credit — ${customerName.trim()})` : "";
    showToast(
      `Bulk sale of ${cart.length} items — KES ${formatWhole(totalAmount)} complete${creditNote}`
    );
  };

  return (
    <div className="p-4 pb-8 flex flex-col lg:flex-row gap-6">
      {/* Column 1: Search & Product Catalog */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Low Stock Preview Banner */}
        {lowStockProducts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="font-bold text-xs text-amber-900">Low Stock Alert</div>
                <div className="text-[11px] text-amber-700">
                  {lowStockProducts.length} spare parts running low
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowLowStockModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              View List
            </button>
          </div>
        )}

        {/* Product Search */}
        <input
          type="text"
          placeholder="Search spare parts by name..."
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Product Cards List */}
        <div className="space-y-3">
          {visibleProducts.length === 0 ? (
            <div className="text-center py-10 bg-white border rounded-xl text-slate-400 text-sm">
              No products found matching &quot;{search}&quot;
            </div>
          ) : (
            visibleProducts.map((product) => (
              <POSProductCard
                key={product._id}
                product={product}
                customers={customers}
                onSell={handleSell}
                onAddToCart={handleAddToCart}
              />
            ))
          )}
        </div>
      </div>

      {/* Column 2: Cart & Customer Debts Sidebar */}
      <div className="w-full lg:w-96 flex flex-col gap-4 flex-shrink-0">
        <Cart
          cart={cart}
          onUpdateQty={handleCartUpdateQty}
          onUpdatePrice={handleCartUpdatePrice}
          onRemoveItem={handleCartRemoveItem}
          onClearCart={handleCartClear}
          onMakeSale={handleCartSale}
          customers={customers}
        />

        <CustomerDebtsCard
          customerCredits={customerCredits}
          grandCreditTotal={grandCreditTotal}
        />
      </div>

      {/* Low Stock Detailed Modal */}
      <LowStockModal
        isOpen={showLowStockModal}
        onClose={() => setShowLowStockModal(false)}
        lowStockProducts={lowStockProducts}
      />
    </div>
  );
}
