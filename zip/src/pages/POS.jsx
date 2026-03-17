import React, { useState, useEffect } from "react";
import { db } from "../db";
import { showToast } from "../utils/toast";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [downPayment, setDownPayment] = useState({});
  const [quantities, setQuantities] = useState({});
  const [sellingPrices, setSellingPrices] = useState({});
  const [showLowStock, setShowLowStock] = useState(true);
  const [creditSales, setCreditSales] = useState({});

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    // if user starts searching, ensure full product list is loaded
    if (search && !fullLoaded) {
      loadFullProducts();
    }
  }, [search]);

  const loadProducts = async () => {
    // Fast path: try to load a small set of product docs by common prefix 'product'
    try {
      const fast = await db.allDocs({ include_docs: true, startkey: 'product', endkey: 'product\uffff', limit: 12 });
      let fastProds = fast.rows.map(r => r.doc).filter(d => d && d.type === 'product');

      // also include cached popular ids from localStorage (if any)
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

    // Fire-and-forget full load in background
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
      // return top 8 ids by count
      return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id])=>id);
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
      isCreditSale: creditSales[product._id] || false,
      dwnPayment: downPayment[product._id] || 0,
    };

    const updatedProduct = {
      ...product,
      stock: product.stock - qty
    };

    await db.put(sale);
    await db.put(updatedProduct);
    loadProducts();
    showToast(`Sold ${qty} x ${product.name} — KES ${total}`);
    // bump popular counter for this product to help fast loads
    try { bumpPopular(product._id); } catch (e) { /* ignore */ }
    // Reset quantity for that product to 1
    setQuantities(prev => ({ ...prev, [product._id]: 1 }));
    setCreditSales({});
    setSellingPrices(prev => ({ ...prev, [product._id]: product.sellingPrice}));
    setDownPayment({});
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock <= 2);

  return (
    <div className="p-4 pb-8 flex space-between">
      <div className="max-w-xl">
      <input
        type="text"
        placeholder="Search product..."
        className="w-full mb-4 p-2 border rounded"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-3">
        {filteredProducts.map(product => (
          <div key={product._id} className="border max-w-xl px-3 pt-2 rounded flex justify-between">
            <div>{product.name}<p className="text-sm text-gray-600"> {product.stock} remaining </p> </div>
            <div className="flex justify-end items-start">
              <input
                type="number"
                className="border mr-1 p-1 w-16 rounded"
                value={ sellingPrices[product._id] || product.sellingPrice }
                onChange={(e) =>
                  setSellingPrices(prev => ({
                    ...prev,
                    [product._id]: parseInt(e.target.value)
                  }))
                }
              />
              <input
                type="number"
                min="1"
                className="border mr-1 p-1 w-12 rounded"
                value={quantities[product._id] || 1}
                onChange={(e) =>
                  setQuantities(prev => ({
                    ...prev,
                    [product._id]: parseInt(e.target.value) || 1
                  }))
                }
              /> 
              <div className="border mr-1 p-1 w-16 rounded">
                <label htmlFor="credit">Crt?</label>
                <input
                className="mx-1"
                type="checkbox"
                name="credit"
                id="credit"
                checked={creditSales[product._id]}
                onChange={(e) => {
                  setCreditSales(prev => ({
                    ...prev,
                    [product._id]: !prev[product._id]                 }));
                }}
              />
              </div>
              { creditSales[product._id] && (
              <div>
              <input
                type="number"
                className="border mr-1 p-1 w-16 rounded"
                value={ downPayment[product._id] || 0 }
                onChange={(e) =>
                  setDownPayment(prev => ({
                    ...prev,
                    [product._id]: parseInt(e.target.value)
                  }))
                }
              />
              </div>
              )}
              <div>
                <button
                  onClick={() => handleSell(product)}
                  className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                >
                  Sell ({(quantities[product._id] || 1) * (sellingPrices[product._id] || product.sellingPrice)})
                </button>
                <p className="text-sm text-center text-gray-600">(Profit - { ((sellingPrices[product._id] || product.sellingPrice) - product.costPrice) * (quantities[product._id] || 1) } )</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
        {showLowStock && lowStockProducts.length > 0 && (
        <div className="max-w-xl mb-4 ml-4 bg-red-100 p-4 rounded relative">
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
  );
}

