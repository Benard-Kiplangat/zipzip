<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import SyncButton from "../components/SyncButton";
import { formatWhole } from "../utils/format";
=======
import React, { useEffect, useState } from "react";
import { db } from "../db";
import SyncButton from "../components/SyncButton";
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", costPrice: "", sellingPrice: "", stock: "", lowStockThreshold: "", id: null });
  const [totalCostValue, setTotalCostValue] = useState(0);
  const [totalSaleValue, setTotalSaleValue] = useState(0);

  useEffect(() => {
    loadProducts();
  }, []);

<<<<<<< HEAD
  useEffect(() => {
    const handleDataRefresh = () => {
      loadProducts();
    };

    window.addEventListener('bosco:db-changed', handleDataRefresh);
    return () => window.removeEventListener('bosco:db-changed', handleDataRefresh);
  }, []);

  const hload = async () => {
    if (window.electronAPI?.hardRefresh) {
      await window.electronAPI.hardRefresh();
    } else {
      window.location.reload();
    }
  };

  const loadProducts = async () => {
    const result = await db.allDocs({
      include_docs: true,
      startkey: "product_",
      endkey: "product_\uffff",
    });
    const items = result.rows.map(row => row.doc).filter(doc => doc && doc.type === "product");
=======
  const loadProducts = async () => {
    const result = await db.allDocs({ include_docs: true });
    const items = result.rows.map(row => row.doc).filter(doc => doc.type === "product");
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
    setProducts(items);

    let cost = 0;
    let sale = 0;
    items.forEach(item => {
<<<<<<< HEAD
      cost += (Number(item.stock) || 0) * (Number(item.costPrice) || 0);
      sale += (Number(item.stock) || 0) * (Number(item.sellingPrice) || 0);
=======
      cost += item.stock * item.costPrice;
      sale += item.stock * item.sellingPrice;
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
    });
    setTotalCostValue(cost);
    setTotalSaleValue(sale);
  };

<<<<<<< HEAD
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(p => (p.name || "").toLowerCase().includes(query));
  }, [products, search]);

  const visibleProducts = filteredProducts.slice(0, 100);
=======
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
<<<<<<< HEAD
    if (!form.name || !form.costPrice || !form.sellingPrice || !form.stock) {
      return alert("Please fill in Product Name, Cost Price, Selling Price, and Stock Quantity.");
    }
=======
    if (!form.name || !form.costPrice || !form.sellingPrice || !form.stock) return;
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff

    let existing = products.find(p => p.name.toLowerCase() === form.name.toLowerCase());

    if (existing && !form.id) {
      existing.stock = parseInt(existing.stock) + parseInt(form.stock);
      if (form.lowStockThreshold !== "") existing.lowStockThreshold = Number(form.lowStockThreshold);
      await db.put({ ...existing });
    } else if (form.id) {
      const doc = {
        _id: form.id,
        _rev: form._rev,
        type: "product",
        name: form.name,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        stock: Number(form.stock),
      };
      if (form.lowStockThreshold !== "") doc.lowStockThreshold = Number(form.lowStockThreshold);
      await db.put(doc);
    } else {
      const doc = {
        _id: `product_${Date.now()}`,
        type: "product",
        name: form.name,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        stock: Number(form.stock),
      };
      if (form.lowStockThreshold !== "") doc.lowStockThreshold = Number(form.lowStockThreshold);
      await db.put(doc);
    }
    setForm({ name: "", costPrice: "", sellingPrice: "", stock: "", lowStockThreshold: "", id: null });
    loadProducts();
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold ?? "",
      id: product._id,
      _rev: product._rev,
    });
  };

  const handleDelete = async (product) => {
<<<<<<< HEAD
    if (window.confirm(`Are you sure you want to delete "${product.name}"?`)) {
=======
    if (window.confirm("Are you sure you want to delete this product?")) {
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
      await db.remove(product);
      loadProducts();
    }
  };

<<<<<<< HEAD
  const expectedProfit = totalSaleValue - totalCostValue;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            ⚙️ Auto Spares Inventory Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track spare parts stock, cost prices, retail selling prices, and re-order thresholds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={hload}
            className="btn-secondary text-xs"
            title="Reload application state"
          >
            ↻ Hard Refresh
          </button>
          <SyncButton />
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Inventory Cost</div>
          <div className="text-2xl font-black text-slate-900">KES {formatWhole(totalCostValue).toLocaleString()}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Retail Value</div>
          <div className="text-2xl font-black text-blue-700">KES {formatWhole(totalSaleValue).toLocaleString()}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Potential Profit</div>
          <div className="text-2xl font-black text-emerald-600">KES {formatWhole(expectedProfit).toLocaleString()}</div>
        </div>
      </div>

      {/* Add / Edit Product Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          {form.id ? "✏️ Edit Spare Part Product" : "➕ Register Spare Part Product"}
        </h2>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Part / Product Name</label>
            <input
              name="name"
              placeholder="e.g. Brake Pads Toyota Hilux 2.5"
              value={form.name}
              onChange={handleChange}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cost Price (KES)</label>
            <input
              name="costPrice"
              type="number"
              min="0"
              placeholder="e.g. 1500"
              value={form.costPrice}
              onChange={handleChange}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Selling Price (KES)</label>
            <input
              name="sellingPrice"
              type="number"
              min="0"
              placeholder="e.g. 2200"
              value={form.sellingPrice}
              onChange={handleChange}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Qty</label>
            <input
              name="stock"
              type="number"
              min="0"
              placeholder="e.g. 10"
              value={form.stock}
              onChange={handleChange}
              className="input-field"
            />
            </div>
            <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Threshold</label>
            <input
              name="lowStockThreshold"
              type="number"
              min="0"
              placeholder="2"
              value={form.lowStockThreshold}
              onChange={handleChange}
              className="input-field"
            />
            </div>
            <div className="flex justify-self-end align-self-center pt-4 pb-2 gap-2 h-18">

            {form.id && (
              <button
                type="button"
                onClick={() => setForm({ name: "", costPrice: "", sellingPrice: "", stock: "", lowStockThreshold: "", id: null })}
                className="btn rounded-2xl bg-gray-200 hover:bg-gray-300 py-1 px-4"
              >
                Cancel
              </button>
            )}
            <button onClick={handleSubmit} className="btn rounded-2xl text-white bg-blue-500 hover:bg-blue-600 mr-4 px-4 py-1">
              {form.id ? "Update Spare Part" : "Add Spare Part"}
            </button>
            </div>
            </div>
          </div>

      {/* Catalog List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">Inventory Catalog ({products.length})</h2>
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="🔍 Search part name..."
              className="input-field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Showing {visibleProducts.length} of {filteredProducts.length} matching item{filteredProducts.length === 1 ? "" : "s"}
        </div>

        <div className="grid grid-cols-1 gap-4">
           {filteredProducts.map(product => (
=======
  return (
    <div className="max-w-xl px-4 pb-32">
      <div className="pb-4">
        <div>Total Stock Value: KES {totalCostValue}</div>
        <div>Total Sales Value: KES {totalSaleValue}</div>

        <SyncButton />
        <div className="border-b mt-4"></div>

          <h2 className="text-xl font-bold my-4">Add/Update Products</h2>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Product Name</label>
              <input name="name" value={form.name} onChange={handleChange} className="border p-2 w-full" />
            </div>
            <div>
              <label className="block mb-1">Cost Price</label>
              <input name="costPrice" type="number" value={form.costPrice} onChange={handleChange} className="border p-2 w-full" />
            </div>
            <div>
              <label className="block mb-1">Selling Price</label>
              <input name="sellingPrice" type="number" value={form.sellingPrice} onChange={handleChange} className="border p-2 w-full" />
            </div>
            <div>
              <label className="block mb-1">Stock Quantity</label>
              <input name="stock" type="number" value={form.stock} onChange={handleChange} className="border p-2 w-full" />
            </div>
            <div>
              <label className="block mb-1">Low stock alert at (default: 2)</label>
              <input name="lowStockThreshold" type="number" min="0" placeholder="2" value={form.lowStockThreshold} onChange={handleChange} className="border p-2 w-full" />
            </div>
          </div>
          <div className="flex m-2">
            <div className="mr-6">
              <button onClick={handleSubmit} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
                {form.id ? "Update Product" : "Add Product"}
              </button>
            </div>
          </div>

          <h2 className="text-lg font-semibold mt-8 mb-2">Product List</h2>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search product..."
              className="w-full mb-4 p-2 border rounded"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filteredProducts.map(product => (
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
              <div key={product._id} className="border p-3 rounded flex justify-between items-center">
                <div>
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-sm text-gray-600">
                    Cost: {product.costPrice}, Selling: {product.sellingPrice}, Stock: {product.stock}
                    {product.lowStockThreshold != null && (
                      <span className="ml-2 text-orange-600">(alert at {product.lowStockThreshold})</span>
                    )}
                  </div>
                </div>
                <div className="space-x-2">
                  <button onClick={() => handleEdit(product)} className="bg-yellow-500 text-white px-2 py-1 rounded">Edit</button>
                  <button onClick={() => handleDelete(product)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
                </div>
              </div>
            ))}
<<<<<<< HEAD
        </div>
      </div>
    </div>
  );
}

=======
          </div>
        </div>
    </div>
  );
}
>>>>>>> 26f2355402417aafd15fbceedae628b2eedadbff
