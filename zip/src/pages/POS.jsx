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
  const [cart, setCart] = useState([]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (search && !fullLoaded) {
      loadFullProducts();
    }
  }, [search]);

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
    try { bumpPopular(product._id); } catch (e) { /* ignore */ }
    setQuantities(prev => ({ ...prev, [product._id]: 1 }));
    setCreditSales({});
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

  const handleCartClear = () => {
    setCart([]);
  };

  const handleCartSale = async () => {
    if (cart.length === 0) return;

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
        isCreditSale: false,
        dwnPayment: 0,
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
    showToast(`Bulk sale of ${cart.length} items — KES ${totalAmount} complete`);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock <= 2);

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
            <div key={product._id} className="border max-w-xl px-3 pt-2 rounded flex justify-between">
              <div>{product.name}<p className="text-sm text-gray-600"> {product.stock} remaining </p> </div>
              <div className="flex justify-end items-start">
                <input
                  type="number"
                  className="border mr-1 p-1 w-16 rounded"
                  value={sellingPrices[product._id] || product.sellingPrice}
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
                    checked={creditSales[product._id] || false}
                    onChange={() => {
                      setCreditSales(prev => ({
                        ...prev,
                        [product._id]: !prev[product._id]
                      }));
                    }}
                  />
                </div>
                {creditSales[product._id] && (
                  <div>
                    <input
                      type="number"
                      className="border mr-1 p-1 w-16 rounded"
                      value={downPayment[product._id] || 0}
                      onChange={(e) =>
                        setDownPayment(prev => ({
                          ...prev,
                          [product._id]: parseInt(e.target.value)
                        }))
                      }
                    />
                  </div>
                )}
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
                  <p className="text-sm text-center text-gray-600">
                    (Profit - {((sellingPrices[product._id] || product.sellingPrice) - product.costPrice) * (quantities[product._id] || 1)})
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Cart
          cart={cart}
          onUpdateQty={handleCartUpdateQty}
          onUpdatePrice={handleCartUpdatePrice}
          onRemoveItem={handleCartRemoveItem}
          onClearCart={handleCartClear}
          onMakeSale={handleCartSale}
        />

        {showLowStock && lowStockProducts.length > 0 && (
          <div className="w-72 bg-red-100 p-4 rounded relative">
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
    </div>
  );
}
