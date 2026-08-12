<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

export default function Purchase() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [quantityById, setQuantityById] = useState({});
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const { canViewStock } = useAuth();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadData();
    };

    window.addEventListener('bosco:db-changed', handleDataRefresh);
    return () => window.removeEventListener('bosco:db-changed', handleDataRefresh);
  }, []);

  const loadData = async () => {
    await Promise.all([loadProducts(), loadPurchases()]);
  };

  const loadProducts = async () => {
    const res = await db.allDocs({
      include_docs: true,
      startkey: "product",
      endkey: "product\uffff",
    });
    const prods = res.rows.map(r => r.doc).filter(d => d && d.type === "product");
    setProducts(prods.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    const map = {};
    prods.forEach(p => { map[p._id] = 1; });
    setQuantityById(map);
  };

  const loadPurchases = async () => {
    const res = await db.allDocs({
      include_docs: true,
      startkey: "purchase:",
      endkey: "purchase:\uffff",
    });
    const purchases = res.rows.map(r => r.doc).filter(d => d && d.type === "purchase");
    setPurchaseHistory(purchases.sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  const createPurchaseRecord = async ({ productId, name, quantity, costPrice }) => {
    const record = {
      _id: `purchase:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
      type: 'purchase',
      productId,
      name,
      quantity,
      costPrice,
      totalCost: quantity * costPrice,
      date: new Date().toISOString(),
    };
    await db.put(record);
  };

  const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  };

  const isSameDay = (a, b) => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  const handleBulkAdd = async () => {
    // Accepts multiple lines. each line: name,buyingPrice,sellingPrice,quantity
    const lines = bulkInput.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return alert('Please paste at least one line.');

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 4) {
        console.warn('Skipping invalid line:', line);
        continue;
      }
      const name = parts[0];
      const costPrice = parseFloat(parts[1]) || 0;
      const sellingPrice = parseFloat(parts[2]) || 0;
      const qty = parseInt(parts[3]) || 0;

      // check existing by name (case-insensitive)
      const existing = products.find(p => (p.name || '').toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.stock = (Number(existing.stock) || 0) + qty;
        existing.costPrice = costPrice || existing.costPrice;
        existing.sellingPrice = sellingPrice || existing.sellingPrice;
        try {
          await db.put(existing);
          await createPurchaseRecord({
            productId: existing._id,
            name: existing.name,
            quantity: qty,
            costPrice: costPrice || existing.costPrice || 0,
          });
        } catch (e) {
          console.error('update failed', e);
        }
      } else {
        const doc = {
        _id: `product_${Date.now()}:${Math.floor(Math.random()*1000)}`,
        type: "product",
        name,
        costPrice,
        sellingPrice,
        stock: qty,
      };
        try {
          await db.put(doc);
          await createPurchaseRecord({
            productId: doc._id,
            name: doc.name,
            quantity: qty,
            costPrice: doc.costPrice,
          });
        } catch (e) {
          console.error('create failed', e);
        }
      }
    }
    setBulkInput('');
    await loadData();
    await loadProducts();
    alert('Bulk add complete');
  };

  const handleAddToExisting = async (productId) => {
    const qty = Number(quantityById[productId]) || 1;
    const prod = products.find(p => p._id === productId);
    if (!prod) return;
    prod.stock = (Number(prod.stock) || 0) + qty;
    try {
      await db.put(prod);
      await createPurchaseRecord({
        productId: prod._id,
        name: prod.name,
        quantity: qty,
        costPrice: prod.costPrice || 0,
      });
      await loadData();
    } catch (e) {
      console.error('failed to add stock', e);
      alert('Failed to add stock. See console.');
    }
  };

  const handleQtyChange = (id, value) => {
    setQuantityById(prev => ({ ...prev, [id]: value }));
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(p => p.name && p.name.toLowerCase().includes(query));
  }, [products, search]);

  const sortedPurchases = useMemo(() => [...purchaseHistory].sort((a, b) => new Date(b.date) - new Date(a.date)), [purchaseHistory]);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const thisMonth = [];
  const thisWeek = [];
  const today = [];

  sortedPurchases.forEach((purchase) => {
    const purchaseDate = new Date(purchase.date);
    if (isSameDay(purchaseDate, now)) {
      today.push(purchase);
    }
    if (purchaseDate >= weekStart) {
      thisWeek.push(purchase);
    }
    if (purchaseDate.getMonth() === now.getMonth() && purchaseDate.getFullYear() === now.getFullYear()) {
      thisMonth.push(purchase);
    }
  });

  const formatCurrency = (amount) => formatWhole(amount);
  const totalCost = (items) => items.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);

  return (
    <div className="px-4 pb-32 max-w-full">
      <h1 className="text-xl font-bold mb-4">Purchase / Add Stock</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="mb-4 bg-white border rounded p-4 shadow-sm">
            <label className="block font-semibold mb-1">Bulk input (one per line: name,buyingPrice,sellingPrice,quantity)</label>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              className="w-full border p-2 rounded h-28"
              placeholder="eg: Air Filter,300,400,10"
            />
            <div className="mt-2">
              <button onClick={handleBulkAdd} className="px-3 py-1 rounded bg-blue-600 text-white">Add Bulk Stock</button>
            </div>
          </div>

          <div className="mb-4 bg-white border rounded p-4 shadow-sm">
            <label className="block font-semibold mb-1">Search existing products</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border p-2 rounded"
              placeholder="Search by name..."
            />
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-sm text-gray-600">No products found.</div>
            )}

            {filtered.map(p => (
              <div key={p._id} className="border p-3 rounded flex items-center justify-between bg-gray-50">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-gray-600">
                    Stock: {canViewStock ? (p.stock || 0) : "Hidden"} — Buy: KES {formatWhole(p.costPrice || 0)} — Sell: KES {formatWhole(p.sellingPrice || 0)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={quantityById[p._id] || 1}
                    onChange={(e) => handleQtyChange(p._id, Number(e.target.value))}
                    className="w-20 border p-1 rounded text-right"
                  />
                  <button
                    onClick={() => handleAddToExisting(p._id)}
                    className="px-3 py-1 rounded bg-green-600 text-white"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-white border rounded p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Purchase History</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <div className="font-semibold">Today</div>
                <div>{today.length} purchase{today.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(today))}</div>
              </div>
              <div>
                <div className="font-semibold">This Week</div>
                <div>{thisWeek.length} purchase{thisWeek.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(thisWeek))}</div>
              </div>
              <div>
                <div className="font-semibold">This Month</div>
                <div>{thisMonth.length} purchase{thisMonth.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(thisMonth))}</div>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-sm font-semibold mb-2">Date range</div>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-1 rounded" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-1 rounded" />
                <button onClick={() => {
                  const d = new Date();
                  const f = new Date();
                  f.setDate(d.getDate() - 7);
                  setDateFrom(f.toISOString().slice(0,10));
                  setDateTo(d.toISOString().slice(0,10));
                }} className="px-2 py-1 bg-gray-100 rounded">Last 7d</button>
              </div>
            </div>
            <h3 className="text-md font-semibold mb-3">Recent Purchases</h3>
            {sortedPurchases.length === 0 ? (
              <div className="text-sm text-gray-600">No purchase history yet.</div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const rangeStart = new Date(dateFrom + 'T00:00:00');
                  const rangeEnd = new Date(dateTo + 'T23:59:59');
                  return sortedPurchases
                    .filter(p => {
                      const d = new Date(p.date);
                      return d >= rangeStart && d <= rangeEnd;
                    })
                    .slice(0, 6)
                    .map((purchase) => (
                      <div key={purchase._id} className="rounded border border-gray-100 p-3 bg-gray-50">
                        <div className="font-semibold text-sm">{purchase.name}</div>
                        <div className="text-xs text-gray-600">
                          {purchase.quantity} units @ KES {formatCurrency(purchase.costPrice)}
                        </div>
                        <div className="text-xs text-gray-600">{new Date(purchase.date).toLocaleString()}</div>
                      </div>
                    ));
                })()}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
=======
import React, { useEffect, useState } from "react";
import { db } from "../db";
import { useAuth } from "../context/AuthContext";

export default function Purchase() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [quantityById, setQuantityById] = useState({});
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const { canViewStock } = useAuth();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadProducts(), loadPurchases()]);
  };

  const loadProducts = async () => {
    const res = await db.allDocs({ include_docs: true });
    const prods = res.rows.map(r => r.doc).filter(d => d.type === "product");
    setProducts(prods.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    // initialize quantity inputs
    const map = {};
    prods.forEach(p => { map[p._id] = 1; });
    setQuantityById(map);
  };

  const loadPurchases = async () => {
    const res = await db.allDocs({ include_docs: true });
    const purchases = res.rows.map(r => r.doc).filter(d => d.type === "purchase");
    setPurchaseHistory(purchases.sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  const createPurchaseRecord = async ({ productId, name, quantity, costPrice }) => {
    const record = {
      _id: `purchase:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
      type: 'purchase',
      productId,
      name,
      quantity,
      costPrice,
      totalCost: quantity * costPrice,
      date: new Date().toISOString(),
    };
    await db.put(record);
  };

  const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  };

  const isSameDay = (a, b) => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  const handleBulkAdd = async () => {
    // Accepts multiple lines. each line: name,buyingPrice,sellingPrice,quantity
    const lines = bulkInput.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return alert('Please paste at least one line.');

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 4) {
        console.warn('Skipping invalid line:', line);
        continue;
      }
      const name = parts[0];
      const costPrice = parseFloat(parts[1]) || 0;
      const sellingPrice = parseFloat(parts[2]) || 0;
      const qty = parseInt(parts[3]) || 0;

      // check existing by name (case-insensitive)
      const existing = products.find(p => (p.name || '').toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.stock = (Number(existing.stock) || 0) + qty;
        existing.costPrice = costPrice || existing.costPrice;
        existing.sellingPrice = sellingPrice || existing.sellingPrice;
        try {
          await db.put(existing);
          await createPurchaseRecord({
            productId: existing._id,
            name: existing.name,
            quantity: qty,
            costPrice: costPrice || existing.costPrice || 0,
          });
        } catch (e) {
          console.error('update failed', e);
        }
      } else {
        const doc = {
          _id: `product:${name.replace(/\s+/g, '_')}:${Date.now()}:${Math.floor(Math.random()*1000)}`,
          type: 'product',
          name,
          costPrice,
          sellingPrice,
          stock: qty,
        };
        try {
          await db.put(doc);
          await createPurchaseRecord({
            productId: doc._id,
            name: doc.name,
            quantity: qty,
            costPrice: doc.costPrice,
          });
        } catch (e) {
          console.error('create failed', e);
        }
      }
    }

    setBulkInput('');
    await loadData();
    alert('Bulk add complete');
  };

  const handleAddToExisting = async (productId) => {
    const qty = Number(quantityById[productId]) || 1;
    const prod = products.find(p => p._id === productId);
    if (!prod) return;
    prod.stock = (Number(prod.stock) || 0) + qty;
    try {
      await db.put(prod);
      await createPurchaseRecord({
        productId: prod._id,
        name: prod.name,
        quantity: qty,
        costPrice: prod.costPrice || 0,
      });
      await loadData();
    } catch (e) {
      console.error('failed to add stock', e);
      alert('Failed to add stock. See console.');
    }
  };

  const handleQtyChange = (id, value) => {
    setQuantityById(prev => ({ ...prev, [id]: value }));
  };

  const filtered = products.filter(p => p.name && p.name.toLowerCase().includes(search.toLowerCase()));

  const sortedPurchases = [...purchaseHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
  const now = new Date();
  const weekStart = startOfWeek(now);
  const thisMonth = [];
  const thisWeek = [];
  const today = [];

  sortedPurchases.forEach((purchase) => {
    const purchaseDate = new Date(purchase.date);
    if (isSameDay(purchaseDate, now)) {
      today.push(purchase);
    }
    if (purchaseDate >= weekStart) {
      thisWeek.push(purchase);
    }
    if (purchaseDate.getMonth() === now.getMonth() && purchaseDate.getFullYear() === now.getFullYear()) {
      thisMonth.push(purchase);
    }
  });

  const formatCurrency = (amount) => Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const totalCost = (items) => items.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);

  return (
    <div className="px-4 pb-32 max-w-full">
      <h1 className="text-xl font-bold mb-4">Purchase / Add Stock</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="mb-4 bg-white border rounded p-4 shadow-sm">
            <label className="block font-semibold mb-1">Bulk input (one per line: name,buyingPrice,sellingPrice,quantity)</label>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              className="w-full border p-2 rounded h-28"
              placeholder="eg: Air Filter,300,400,10"
            />
            <div className="mt-2">
              <button onClick={handleBulkAdd} className="px-3 py-1 rounded bg-blue-600 text-white">Add Bulk Stock</button>
            </div>
          </div>

          <div className="mb-4 bg-white border rounded p-4 shadow-sm">
            <label className="block font-semibold mb-1">Search existing products</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border p-2 rounded"
              placeholder="Search by name..."
            />
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-sm text-gray-600">No products found.</div>
            )}

            {filtered.map(p => (
              <div key={p._id} className="border p-3 rounded flex items-center justify-between bg-gray-50">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-gray-600">
                    Stock: {canViewStock ? (p.stock || 0) : "Hidden"} — Buy: KES {p.costPrice || 0} — Sell: KES {p.sellingPrice || 0}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={quantityById[p._id] || 1}
                    onChange={(e) => handleQtyChange(p._id, Number(e.target.value))}
                    className="w-20 border p-1 rounded text-right"
                  />
                  <button
                    onClick={() => handleAddToExisting(p._id)}
                    className="px-3 py-1 rounded bg-green-600 text-white"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-white border rounded p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Purchase History</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <div className="font-semibold">Today</div>
                <div>{today.length} purchase{today.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(today))}</div>
              </div>
              <div>
                <div className="font-semibold">This Week</div>
                <div>{thisWeek.length} purchase{thisWeek.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(thisWeek))}</div>
              </div>
              <div>
                <div className="font-semibold">This Month</div>
                <div>{thisMonth.length} purchase{thisMonth.length === 1 ? '' : 's'} — Total KES {formatCurrency(totalCost(thisMonth))}</div>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-sm font-semibold mb-2">Date range</div>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-1 rounded" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-1 rounded" />
                <button onClick={() => {
                  const d = new Date();
                  const f = new Date();
                  f.setDate(d.getDate() - 7);
                  setDateFrom(f.toISOString().slice(0,10));
                  setDateTo(d.toISOString().slice(0,10));
                }} className="px-2 py-1 bg-gray-100 rounded">Last 7d</button>
              </div>
            </div>
            <h3 className="text-md font-semibold mb-3">Recent Purchases</h3>
            {sortedPurchases.length === 0 ? (
              <div className="text-sm text-gray-600">No purchase history yet.</div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const rangeStart = new Date(dateFrom + 'T00:00:00');
                  const rangeEnd = new Date(dateTo + 'T23:59:59');
                  return sortedPurchases
                    .filter(p => {
                      const d = new Date(p.date);
                      return d >= rangeStart && d <= rangeEnd;
                    })
                    .slice(0, 6)
                    .map((purchase) => (
                      <div key={purchase._id} className="rounded border border-gray-100 p-3 bg-gray-50">
                        <div className="font-semibold text-sm">{purchase.name}</div>
                        <div className="text-xs text-gray-600">
                          {purchase.quantity} units @ KES {formatCurrency(purchase.costPrice)}
                        </div>
                        <div className="text-xs text-gray-600">{new Date(purchase.date).toLocaleString()}</div>
                      </div>
                    ));
                })()}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
