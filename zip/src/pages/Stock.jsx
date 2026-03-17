import React, { useEffect, useState } from "react";
import { db } from "../db";
import StockPinLogin from "../components/StockPinLogin";
import SyncButton from "../components/SyncButton";

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", costPrice: "", sellingPrice: "", stock: "", id: null });
  const [totalCostValue, setTotalCostValue] = useState(0);
  const [totalSaleValue, setTotalSaleValue] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const result = await db.allDocs({ include_docs: true });
    const items = result.rows.map(row => row.doc).filter(doc => doc.type === "product");
    setProducts(items);
  
  // Calculate summaries before setting
    let cost = 0;
    let sale = 0;
    items.forEach(item => {
    cost += item.stock * item.costPrice;
    sale += item.stock * item.sellingPrice;
    });
  
    setTotalCostValue(cost);
    setTotalSaleValue(sale);
  };

    const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!form.name || !form.costPrice || !form.sellingPrice || !form.stock) return;

    let existing = products.find(p => p.name.toLowerCase() === form.name.toLowerCase());

    if (existing && !form.id) {
      existing.stock = parseInt(existing.stock) + parseInt(form.stock);
      await db.put({ ...existing });
    } else if (form.id) {
      await db.put({
        _id: form.id,
        _rev: form._rev,
        type: "product",
        name: form.name,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        stock: Number(form.stock)
      });
    } else {
      await db.put({
        _id: `product_${Date.now()}`,
        type: "product",
        name: form.name,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        stock: Number(form.stock)
      });
    }
    setForm({ name: "", costPrice: "", sellingPrice: "", stock: "", id: null });
    loadProducts();
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      id: product._id,
      _rev: product._rev
    });
  };

  const handleDelete = async (product) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      await db.remove(product);
      loadProducts();
    }
  };

  return (
    <div className="max-w-xl px-4 pb-32">
      {!authenticated ? (
        <StockPinLogin onSuccess={() => setAuthenticated(true)} />
      ) : (
          <div className="pb-4">
      <div className="">Total Stock Value: KES {totalCostValue}</div>
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
      </div>
      <div className="flex m-2">
        <div className="div mr-6">
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
          <div key={product._id} className="border p-3 rounded flex justify-between items-center">
            <div>
              <div className="font-semibold">{product.name}</div>
              <div className="text-sm text-gray-600">Cost: {product.costPrice}, Selling: {product.sellingPrice}, Stock: {product.stock}</div>
            </div>
            <div className="space-x-2">
              <button onClick={() => handleEdit(product)} className="bg-yellow-500 text-white px-2 py-1 rounded">Edit</button>
              <button onClick={() => handleDelete(product)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>
     </div>
     )}
   </div>
  );
}
