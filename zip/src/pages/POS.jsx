import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import { db } from "../db";
import { showToast } from "../utils/toast";
import Cart from "../components/Cart";
import { formatWhole } from "../utils/format";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [downPayment, setDownPayment] = useState({});
  const [quantities, setQuantities] = useState({});
  const [sellingPrices, setSellingPrices] = useState({});
  const [showLowStock, setShowLowStock] = useState(true);
  const [creditSales, setCreditSales] = useState({});
  const [customerNames, setCustomerNames] = useState({});
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [outstandingCredits, setOutstandingCredits] = useState([]);

  useEffect(() => {
    loadProducts();
    loadOutstandingCredits();
    loadCustomers();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadProducts();
      loadOutstandingCredits();
      loadCustomers();
    };

    window.addEventListener('bosco:db-changed', handleDataRefresh);
    return () => window.removeEventListener('bosco:db-changed', handleDataRefresh);
  }, []);

  const loadCustomers = async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: 'customer:',
        endkey: 'customer:\uffff',
      });
      const custs = result.rows.map(r => r.doc).filter(d => d && d.type === 'customer');
      setCustomers(custs);
    } catch (e) {
      console.error('failed to load customers', e);
    }
  };

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
      const result = await db.allDocs({
        include_docs: true,
        startkey: 'product_',
        endkey: 'product_\uffff',
      });
      const productDocs = result.rows.map(row => row.doc).filter(doc => doc && doc.type === "product");
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
    const now = new Date().toISOString();

const initialPayment = Number(
  downPayment[product._id] || 0
);

const { currentUser } = ""

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
      paymentHistory: [],
      customerName: isCreditSale ? (customerNames[product._id] || "").trim() : "",
    };

    const updatedProduct = { ...product, stock: product.stock - qty };

    await db.put(sale);
    await db.put(updatedProduct);

    setProducts(prev => prev.map(item =>
      item._id === product._id
        ? { ...item, stock: Math.max(0, (Number(item.stock) || 0) - qty) }
        : item
    ));

    if (isCreditSale) {
      setOutstandingCredits(prev => [
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
      const current = productIndex.get(item.product._id);
      if (!current || current.stock < item.qty) {
        alert(`Not enough stock for "${item.product.name}" (${current?.stock ?? 0} remaining)`);
        return;
      }
    }

    const bulkSaleId = new Date().toISOString();

    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      const product = productIndex.get(item.product._id);
      const total = item.qty * item.sellingPrice;
      const profit = total - (product.costPrice * item.qty);
      const now = new Date().toISOString();


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

      try { bumpPopular(product._id); } catch (e) { /* ignore */ }
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
    setCart([]);

    setProducts(prev => prev.map(product => {
      const cartItem = cart.find(item => item.product._id === product._id);
      if (!cartItem) return product;
      return { ...product, stock: Math.max(0, (Number(product.stock) || 0) - cartItem.qty) };
    }));

    if (isCreditSale) {
      const nextCreditEntry = {
        isBulkGroup: true,
        bulkSaleId,
        customerName,
        dwnPayment: Number(dwnPayment),
        timestamp: bulkSaleId,
        items: cart.map(item => ({
          _id: `${bulkSaleId}-${item.product._id}`,
          name: item.product.name,
          quantity: item.qty,
          total: item.qty * item.sellingPrice,
          customerName,
        })),
      };
      setOutstandingCredits(prev => [nextCreditEntry, ...prev]);
    }

    const creditNote = isCreditSale ? ` (Credit — ${customerName})` : "";
    showToast(`Bulk sale of ${cart.length} items — KES ${formatWhole(totalAmount)} complete${creditNote}`);
  };

  const productIndex = useMemo(() => new Map(products.map(product => [product._id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter(product => (product.name || "").toLowerCase().includes(query));
  }, [products, deferredSearch]);

  const visibleProducts = useMemo(() => filteredProducts.slice(0, 120), [filteredProducts]);

  const lowStockProducts = useMemo(() => {
    return products.filter(product => product.stock <= (product.lowStockThreshold ?? 2));
  }, [products]);

  const customerCredits = useMemo(() => {
    const customerCreditMap = {};
    outstandingCredits.forEach(entry => {
      const name = entry.customerName || "Unknown";
      const date = entry.timestamp;
      if (!customerCreditMap[name]) customerCreditMap[name] = { name, date, entries: [], totalOwed: 0 };
      if (entry.isBulkGroup) {
        const bulkTotal = entry.items.reduce((s, i) => s + i.total, 0);
        const owed = bulkTotal - (entry.dwnPayment || 0);
        customerCreditMap[name].entries.push({ owed, label: `Bulk (${entry.items.length} items)`, detail: entry.items.map(i => `${i.quantity}×${i.name}`).join(", ") });
        customerCreditMap[name].totalOwed += owed;
      } else {
        const owed = entry.total - (entry.dwnPayment || 0);
        customerCreditMap[name].entries.push({ owed, label: `${entry.quantity} × ${entry.name}`, detail: null });
        customerCreditMap[name].totalOwed += owed;
      }
    });

    return Object.values(customerCreditMap).sort((a, b) => b.totalOwed - a.totalOwed);
  }, [outstandingCredits]);
  const grandCreditTotal = useMemo(() => customerCredits.reduce((s, c) => s + c.totalOwed, 0), [customerCredits]);

  const [showLowStockModal, setShowLowStockModal] = useState(false);

  return (
    <div className="p-4 pb-8 flex flex-col lg:flex-row gap-4">
      {/* Col 1: POS Catalog List (Original Design) */}
      <div className="max-w-xl flex-shrink-0 w-full lg:w-auto">

 {/* Low Stock Preview Card on Top of Cart */}
        {lowStockProducts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="font-bold text-xs text-amber-900">Low Stock Alert</div>
                <div className="text-[11px] text-amber-700">{lowStockProducts.length} parts running low</div>
              </div>
            </div>
            <button
              onClick={() => setShowLowStockModal(true)}
              className="btn-warning text-xs px-2.5 py-1"
            >
              View List
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Search product..."
          className="w-full mb-4 p-2 border rounded"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-3">
          {visibleProducts.map(product => (
            <div key={product._id} className="border min-w-xl max-w-xl px-3 pt-2 pb-2 rounded">
              <div className="flex flex-col gap-1 justify-center items-start">
                <div className="flex w-full justify-between">
                  <div>
                  {product.name}
                  <span className="pl-2 text-green-500 text-sm text-gray-600">{(product.stock < 1) ? <span className='text-red-500'>Out of Stock</span> : `${product.stock} remaining`}</span></div>
                  <p className="sm:hidden text-sm text-gray-600">
                      (Profit - {formatWhole(((sellingPrices[product._id] || product.sellingPrice) - product.costPrice) * (quantities[product._id] || 1))})
                    </p>
                </div>
                      <div className="flex gap-2 justify-between items-end w-full">
                <div className="flex items-start flex-wrap gap-1">
                  <input
                    type="number"
                    className="max-w-[75px] border p-1 w-24 h-8 rounded"
                    value={sellingPrices[product._id] ?? product.sellingPrice}
                    onChange={(e) =>
                      setSellingPrices(prev => ({ ...prev, [product._id]: Number(e.target.value) || "" }))
                    }
                  />
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, product.stock)}
                          disabled={product.stock < 1}
                          className="max-w-[75px] border p-1 w-24 h-8 rounded text-sm"
                          value={quantities[product._id] ?? 1}
                          onChange={(e) =>
                            setQuantities(prev => ({
                              ...prev,
                              [product._id]: parseInt(e.target.value, 10)
                            }))
                          }
                        />
                  <div className="sm:hidden p-1 h-8 rounded flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      checked={creditSales[product._id] || false}
                      onChange={() =>
                        setCreditSales(prev => ({ ...prev, [product._id]: !prev[product._id] }))
                      }
                    />Credit Sale
                    </div>
                </div>
                <div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => handleSell(product)}
                        className="bg-green-600 text-white px-3 h-8 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                      >
                        Sell <span className="sm:hidden">({formatWhole((quantities[product._id] || 1) * (sellingPrices[product._id] || product.sellingPrice))})</span>
                      </button>
                      <button
                        onClick={() => handleAddToCart(product)}
                        className="min-w-[75px] bg-blue-500 text-white px-3 py-1 h-8 rounded hover:bg-blue-600 whitespace-nowrap"
                      >
                        + Cart
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
            </div>

              {creditSales[product._id] && (
                <div className="flex gap-2 items-center mt-2 max-w-xl">
                    <select
                      className="border p-1 h-8 rounded max-w-[45%]"
                      value={customerNames[product._id] || ""}
                      onChange={(e) => setCustomerNames(prev => ({ ...prev, [product._id]: e.target.value }))}
                    >
                      <option value="">Select customer...</option>
                      {customers.map(c => (
                        <option key={c._id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                     {/* Enter customer name */}
    <input
      type="text"
      className="border p-1 h-8 rounded max-w-[45%]"
      placeholder="Customer name..."
      value={ customerNames[product._id] || "" }
      onChange={(e) =>
        setCustomerNames(prev => ({
          ...prev,
          [product._id]: e.target.value,
        }))
      }
    />
                  <input
                    type="number"
                    placeholder="Deposit"
                    className="border p-1 rounded max-w-[125px]"
                    value={downPayment[product._id] ?? ""}
                    onChange={(e) =>
                      setDownPayment(prev => ({ ...prev, [product._id]: parseInt(e.target.value, 10) || 0 }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Col 2: Cart + Low Stock Preview */}
      <div className="flex flex-col gap-4 w-full">
        <Cart
          cart={cart}
          onUpdateQty={handleCartUpdateQty}
          onUpdatePrice={handleCartUpdatePrice}
          onRemoveItem={handleCartRemoveItem}
          onClearCart={handleCartClear}
          onMakeSale={handleCartSale}
          customers={customers}
        />
        {/* Outstanding Credits Summary */}
        {customerCredits.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-sm space-y-3">
            <h2 className="text-base font-bold text-amber-900 flex items-center justify-between">
              <span>📋 Customer Debts</span>
              <span className="badge-warning">KES {grandCreditTotal.toLocaleString()}</span>
            </h2>
            <div className="space-y-2 max-h-[350px] px-1 overflow-y-auto">
              {customerCredits.map(customer => (
                <div key={customer.name} className="bg-white border border-amber-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="font-bold text-slate-900 flex justify-between">
                    <span>{customer.name}</span>
                    <div className="text-xs text-slate-500">
                      <span className="text-gray-500">Date: {new Date(customer.date).toLocaleDateString() || "N/A"}</span>
                    </div>
                  </div>
                  {customer.entries.map((e, i) => (
                    <div key={i} className="text-slate-500">
                      {e.label}: KES {e.owed}
                    </div>
                  ))}
                  <hr />
                  <div className="flex justify-between pt-2 text-rose-600 font-bold"><span className="pr-4">Total Owed:</span> <span>KES {customer.totalOwed}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Low Stock Modal Pop-up */}
      {showLowStockModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>⚠️ Low Stock Spare Parts</span>
                <span className="badge-warning">{lowStockProducts.length} items</span>
              </h3>
              <button
                onClick={() => setShowLowStockModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr className="">
                    <th className="p-2 w-[65%]">Spare Part Name</th>
                    <th className="py-2">Stock Left</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockProducts.map(product => {
                    const threshold = product.lowStockThreshold != null ? Number(product.lowStockThreshold) : 2;
                    const isOut = Number(product.stock) <= 0;
                    return (
                      <tr key={product._id} className="hover:bg-slate-50 py-0.5">
                        <td className="font-semibold text-slate-900">{product.name}</td>
                        <td className={`font-bold ${isOut ? 'text-rose-600' : 'text-amber-600'}`}>
                          {product.stock} units
                        </td>
                        <td className="">
                          <span className={isOut ? "badge-danger" : "badge-warning"}>
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
      )}
    </div>
  );
}


