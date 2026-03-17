import React, { useEffect, useState } from "react";
import { db } from "../db";
import StockPinLogin from "../components/StockPinLogin";

export default function Purchase() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [quantityById, setQuantityById] = useState({});
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const res = await db.allDocs({ include_docs: true });
    const prods = res.rows.map(r => r.doc).filter(d => d.type === "product");
    setProducts(prods.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    // initialize quantity inputs
    const map = {};
    prods.forEach(p => { map[p._id] = 1; });
    setQuantityById(map);
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
        try { await db.put(existing); } catch (e) { console.error('update failed', e); }
      } else {
        const doc = {
          _id: `product:${name.replace(/\s+/g, '_')}:${Date.now()}:${Math.floor(Math.random()*1000)}`,
          type: 'product',
          name,
          costPrice,
          sellingPrice,
          stock: qty,
        };
        try { await db.put(doc); } catch (e) { console.error('create failed', e); }
      }
    }

    setBulkInput('');
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
      await loadProducts();
    } catch (e) { console.error('failed to add stock', e); alert('Failed to add stock. See console.'); }
  };

  const handleQtyChange = (id, value) => {
    setQuantityById(prev => ({ ...prev, [id]: value }));
  };

  const filtered = products.filter(p => p.name && p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="px-4 pb-32 max-w-xl">
      {!authenticated ? (
        <StockPinLogin onSuccess={() => setAuthenticated(true)} />
      ) : (<div>
      <h1 className="text-xl font-bold mb-4">Purchase / Add Stock</h1>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Bulk input (one per line: name,buyingPrice,sellingPrice,quantity)</label>
        <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} className="w-full border p-2 rounded h-28" placeholder={`eg: Air Filter,300,400,10`} />
        <div className="mt-2">
          <button onClick={handleBulkAdd} className="px-3 py-1 rounded bg-blue-600 text-white">Add Bulk Stock</button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1">Search existing products</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full border p-2 rounded" placeholder="Search by name..." />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <div className="text-sm text-gray-600">No products found.</div>}
        {filtered.map(p => (
          <div key={p._id} className="border p-3 rounded flex items-center justify-between bg-gray-50">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-gray-600">Stock: {p.stock || 0} — Buy: KES {p.buyingPrice || 0} — Sell: KES {p.sellingPrice || 0}</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={quantityById[p._id] || 1} onChange={(e) => handleQtyChange(p._id, Number(e.target.value))} className="w-20 border p-1 rounded text-right" />
              <button onClick={() => handleAddToExisting(p._id)} className="px-3 py-1 rounded bg-green-600 text-white">Add</button>
            </div>
          </div>
        ))}
      </div>
      </div>
      )}
    </div>
  );
}
