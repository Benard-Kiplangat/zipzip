import React, { useState, useEffect } from "react";
import { db } from "../db";
import { showToast } from "../utils/toast";
import Cart from "../components/Cart";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [downPayment, setDownPayment] = useState({});
  const [quantities, setQuantities] = useState({});
  const [sellingPrices, setSellingPrices] = useState({});
  const [showLowStock, setShowLowStock] = useState(true);
  const [creditSales, setCreditSales] = useState({});
  const [customerNames, setCustomerNames] = useState({});
  const [cart, setCart] = useState([]);
  const [outstandingCredits, setOutstandingCredits] = useState([]);

  useEffect(() => {
    loadProducts();
    loadOutstandingCredits();
  }, []);

  useEffect(() => {
    if (search && !fullLoaded) {
      loadFullProducts();
    }
  }, [search]);

  const loadOutstandingCredits = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const all = result.rows
        .map(r => r.doc)
        .filter(d => d && d.type === "sale" && d.isCreditSale && !d.isCreditPaid);

      const entries = [];
      const bulkMap = {};
      all.forEach(sale => {
        if (sale.isBulkSale && sale.bulkSaleId) {
          if (!bulkMap[sale.bulkSaleId]) {
            const group = {
              isBulkGroup: true,
              bulkSaleId: sale.bulkSaleId,
              customerName: sale.customerName,
              dwnPayment: sale.bulkDwnPayment || 0,
              timestamp: sale.timestamp,
              items: [],
            };
            bulkMap[sale.bulkSaleId] = group;
            entries.push(group);
          }
          bulkMap[sale.bulkSaleId].items.push(sale);
        } else {
          entries.push(sale);
        }
      });

      setOutstandingCredits(entries);
    } catch (e) {
      console.error("Failed to load credit sales", e);
    }
  };

  const loadProducts = async () => {
    try {
      const fast = await db.allDocs({ include_docs: true, startkey: 'product', endkey: 'product\uffff', limit: 12 });
      let fastProds = fast.rows.map(r => r.doc).filter(d => d && d.type === 'product');

      const popular = getPopularIds();
      if (popular.length) {
        const missingIds = popular.filter(id => !fastProds.find(p => p._id === id));
        if (missingIds.length) {
          const got = await Promise.all(missingIds.map(id => db.get(id).catch(() => null)));
          got.forEach(g => { if (g && g.type === 'product') fastProds.push(g); });
        }
      }

      if (fastProds.length) {
        setProducts(fastProds);
      }
    } catch (e) {
      console.warn('fast product load failed', e);
    }

    loadFullProducts();
  };

  const loadFullProducts = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const productDocs = result.rows.map(row => row.doc).filter(doc => doc.type === "product");
      setProducts(productDocs);
      setFullLoaded(true);
    } catch (e) {
      console.error('failed to load full products', e);
    }
  };

  const getPopularIds = () => {
    try {
      const raw = localStorage.getItem('popularCounts');
      if (!raw) return [];
      const map = JSON.parse(raw);
      return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
    } catch (e) { return []; }
  };

  const bumpPopular = (productId) => {
    try {
      const raw = localStorage.getItem('popularCounts');
      const map = raw ? JSON.parse(raw) : {};
      map[productId] = (map[productId] || 0) + 1;
      localStorage.setItem('popularCounts', JSON.stringify(map));
    } catch (e) { /* ignore */ }
  };

  const handleSell = async (product) => {
    const qty = quantities[product._id] || 1;
    if (product.stock < qty) {
      alert("Not enough stock");
      return;
    }

    const isCreditSale = creditSales[product._id] || false;
    if (isCreditSale && !customerNames[product._id]?.trim()) {
      alert("Please enter the customer's name for a credit sale.");
      return;
    }

    const total = qty * (sellingPrices[product._id] || product.sellingPrice);
    const profit = total - (product.costPrice * qty);

    const sale = {
      _id: new Date().toISOString(),
      type: "sale",
      name: product.name,
      quantity: qty,
      total,
      costPrice: product.costPrice,
      sellingPrice: sellingPrices[product._id] || product.sellingPrice,
      profit,
      timestamp: new Date().toISOString(),
      isCreditSale,
      dwnPayment: downPayment[product._id] || 0,
      customerName: isCreditSale ? (customerNames[product._id] || "").trim() : "",
    };

    const updatedProduct = { ...product, stock: product.stock - qty };

    await db.put(sale);
    await db.put(updatedProduct);
    loadProducts();
    loadOutstandingCredits();
    showToast(`Sold ${qty} x ${product.name} — KES ${total}`);
    try { bumpPopular(product._id); } catch (e) { /* ignore */ }
    setQuantities(prev => ({ ...prev, [product._id]: 1 }));
    setCreditSales({});
    setCustomerNames({});
    setSellingPrices(prev => ({ ...prev, [product._id]: product.sellingPrice }));
    setDownPayment({});
  };

  const handleAddToCart = (product) => {
    const qty = quantities[product._id] || 1;
    const price = sellingPrices[product._id] || product.sellingPrice;

    setCart(prev => {
      const existing = prev.find(item => item.product._id === product._id);
      if (existing) {
        return prev.map(item =>
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
    setCart(prev =>
      prev.map(item =>
        item.product._id === productId ? { ...item, qty: Math.max(1, qty) } : item
      )
    );
  };

  const handleCartUpdatePrice = (productId, price) => {
    setCart(prev =>
      prev.map(item =>
        item.product._id === productId ? { ...item, sellingPrice: price } : item
      )
    );
  };

  const handleCartRemoveItem = (productId) => {
    setCart(prev => prev.filter(item => item.product._id !== productId));
  };

  const handleCartClear = () => setCart([]);

  const handleCartSale = async ({ isCreditSale = false, customerName = "", dwnPayment = 0 } = {}) => {
    if (cart.length === 0) return;

    if (isCreditSale && !customerName.trim()) {
      alert("Please enter the customer's name for a credit sale.");
      return;
    }

    for (const item of cart) {
      const current = products.find(p => p._id === item.product._id);
      if (!current || current.stock < item.qty) {
        alert(`Not enough stock for "${item.product.name}" (${current?.stock ?? 0} remaining)`);
        return;
      }
    }

    const bulkSaleId = new Date().toISOString();

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      const product = products.find(p => p._id === item.product._id);
      const total = item.qty * item.sellingPrice;
      const profit = total - (product.costPrice * item.qty);

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
        bulkDwnPayment: isCreditSale ? Number(dwnPayment) : 0,
        isBulkSale: true,
        bulkSaleId,
      };

      await db.put(sale);

      const updatedProduct = { ...product, stock: product.stock - item.qty };
      await db.put(updatedProduct);

      try { bumpPopular(product._id); } catch (e) { /* ignore */ }
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
    setCart([]);
    loadProducts();
    loadOutstandingCredits();
    const creditNote = isCreditSale ? ` (Credit — ${customerName})` : "";
    showToast(`Bulk sale of ${cart.length} items — KES ${totalAmount} complete${creditNote}`);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 2));

  return (
    <div className="p-4 pb-8 flex gap-4">
      <div className="max-w-xl flex-shrink-0">
        <input
          type="text"
          placeholder="Search product..."
          className="w-full mb-4 p-2 border rounded"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-3">
          {filteredProducts.map(product => (
            <div key={product._id} className="border max-w-xl px-3 pt-2 pb-2 rounded">
              <div className="flex justify-between items-start">
                <div>
                  {product.name}
                  <p className="text-sm text-gray-600">{product.stock} remaining</p>
                </div>
                <div className="flex justify-end items-start flex-wrap gap-1">
                  <input
                    type="number"
                    className="border p-1 w-16 rounded"
                    value={sellingPrices[product._id] || product.sellingPrice}
                    onChange={(e) =>
                      setSellingPrices(prev => ({ ...prev, [product._id]: parseInt(e.target.value) }))
                    }
                  />
                  <input
                    type="number"
                    min="1"
                    className="border p-1 w-12 rounded"
                    value={quantities[product._id] || 1}
                    onChange={(e) =>
                      setQuantities(prev => ({ ...prev, [product._id]: parseInt(e.target.value) || 1 }))
                    }
                  />
                  <div className="border p-1 w-16 rounded flex items-center gap-1">
                    <label className="text-xs">Crt?</label>
                    <input
                      type="checkbox"
                      checked={creditSales[product._id] || false}
                      onChange={() =>
                        setCreditSales(prev => ({ ...prev, [product._id]: !prev[product._id] }))
                      }
                    />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSell(product)}
                        className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                      >
                        Sell ({(quantities[product._id] || 1) * (sellingPrices[product._id] || product.sellingPrice)})
                      </button>
                      <button
                        onClick={() => handleAddToCart(product)}
                        className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 whitespace-nowrap"
                      >
                        + Cart
                      </button>
                    </div>
                    <p className="text-sm text-gray-600">
                      (Profit - {((sellingPrices[product._id] || product.sellingPrice) - product.costPrice) * (quantities[product._id] || 1)})
                    </p>
                  </div>
                </div>
              </div>

              {creditSales[product._id] && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Customer name"
                    className="border p-1 rounded flex-1 min-w-32"
                    value={customerNames[product._id] || ""}
                    onChange={(e) =>
                      setCustomerNames(prev => ({ ...prev, [product._id]: e.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Down payment"
                    className="border p-1 w-24 rounded"
                    value={downPayment[product._id] || 0}
                    onChange={(e) =>
                      setDownPayment(prev => ({ ...prev, [product._id]: parseInt(e.target.value) }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Column 2: Cart + Low Stock */}
      <div className="flex flex-col gap-4 w-72 flex-shrink-0">
        <Cart
          cart={cart}
          onUpdateQty={handleCartUpdateQty}
          onUpdatePrice={handleCartUpdatePrice}
          onRemoveItem={handleCartRemoveItem}
          onClearCart={handleCartClear}
          onMakeSale={handleCartSale}
        />

        {showLowStock && lowStockProducts.length > 0 && (
          <div className="bg-red-100 p-4 rounded relative">
            <button
              className="absolute top-2 right-2 text-red-600 font-bold"
              onClick={() => setShowLowStock(false)}
            >
              ×
            </button>
            <h2 className="text-lg font-semibold text-red-600">Low Stock Items</h2>
            <ul className="list-disc pl-5">
              {lowStockProducts.map(product => (
                <li key={product._id} className="text-sm text-gray-700">
                  {product.name} - {product.stock} remaining
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Column 3: Outstanding Credit Sales grouped by customer */}
      <div className="flex flex-col gap-4 w-72 flex-shrink-0">
        {outstandingCredits.length > 0 && (() => {
          const customerMap = {};
          outstandingCredits.forEach(entry => {
            const name = (entry.isBulkGroup ? entry.customerName : entry.customerName) || "Unknown";
            if (!customerMap[name]) customerMap[name] = { name, entries: [], totalOwed: 0 };
            if (entry.isBulkGroup) {
              const bulkTotal = entry.items.reduce((s, i) => s + i.total, 0);
              const owed = bulkTotal - (entry.dwnPayment || 0);
              customerMap[name].entries.push({ ...entry, owed, label: `Bulk (${entry.items.length} items)`, detail: entry.items.map(i => `${i.quantity}×${i.name}`).join(", ") });
              customerMap[name].totalOwed += owed;
            } else {
              const owed = entry.total - (entry.dwnPayment || 0);
              customerMap[name].entries.push({ ...entry, owed, label: `${entry.quantity} × ${entry.name}`, detail: null });
              customerMap[name].totalOwed += owed;
            }
          });
          const customers = Object.values(customerMap).sort((a, b) => b.totalOwed - a.totalOwed);
          const grandTotal = customers.reduce((s, c) => s + c.totalOwed, 0);

          return (
          <div className="bg-yellow-50 border border-yellow-300 p-4 rounded">
            <h2 className="text-lg font-semibold text-yellow-700 mb-2">
              Outstanding Credits ({customers.length} {customers.length === 1 ? "customer" : "customers"})
            </h2>
            <div className="space-y-3">
              {customers.map(customer => (
                <div key={customer.name} className="bg-white border border-yellow-200 rounded p-2 text-sm">
                  <div className="font-semibold text-gray-800 mb-1">{customer.name}</div>
                  {customer.entries.map((e, i) => (
                    <div key={i} className="text-gray-600 text-xs">
                      {e.label}{e.detail ? ` — ${e.detail}` : ""}: KES {e.owed}
                    </div>
                  ))}
                  <div className="text-red-600 font-bold mt-1">Total: KES {customer.totalOwed}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-yellow-300 text-sm font-semibold text-yellow-800">
              Grand total owed: KES {grandTotal}
            </div>
          </div>
        })()}
      </div>
    </div>
  );
}
