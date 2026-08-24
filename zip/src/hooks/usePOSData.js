import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { db } from "../db";

export function usePOSData() {
  const [products, setProducts] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [customers, setCustomers] = useState([]);
  const [outstandingCredits, setOutstandingCredits] = useState([]);

  // Popular product helpers
  const getPopularIds = () => {
    try {
      const raw = localStorage.getItem("popularCounts");
      if (!raw) return [];
      const map = JSON.parse(raw);
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);
    } catch (e) {
      return [];
    }
  };

  const bumpPopular = (productId) => {
    try {
      const raw = localStorage.getItem("popularCounts");
      const map = raw ? JSON.parse(raw) : {};
      map[productId] = (map[productId] || 0) + 1;
      localStorage.setItem("popularCounts", JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  };

  const loadCustomers = async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: "customer:",
        endkey: "customer:\uffff",
      });
      const custs = result.rows.map((r) => r.doc).filter((d) => d && d.type === "customer");
      setCustomers(custs);
    } catch (e) {
      console.error("Failed to load customers", e);
    }
  };

  const loadFullProducts = async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: "product",
        endkey: "product\uffff",
      });
      const productDocs = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === "product");
      setProducts(productDocs);
      setFullLoaded(true);
    } catch (e) {
      console.error("Failed to load full products", e);
    }
  };

  const loadProducts = async () => {
    try {
      const fast = await db.allDocs({
        include_docs: true,
        startkey: "product",
        endkey: "product\uffff",
        limit: 12,
      });
      let fastProds = fast.rows.map((r) => r.doc).filter((d) => d && d.type === "product");

      const popular = getPopularIds();
      if (popular.length) {
        const missingIds = popular.filter((id) => !fastProds.find((p) => p._id === id));
        if (missingIds.length) {
          const got = await Promise.all(missingIds.map((id) => db.get(id).catch(() => null)));
          got.forEach((g) => {
            if (g && g.type === "product") fastProds.push(g);
          });
        }
      }

      if (fastProds.length) {
        setProducts(fastProds);
      }
    } catch (e) {
      console.warn("Fast product load failed", e);
    }

    loadFullProducts();
  };

  const loadOutstandingCredits = async () => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const all = result.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === "sale" && d.isCreditSale && !d.isCreditPaid);

      const entries = [];
      const bulkMap = {};
      all.forEach((sale) => {
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

  // Initial load
  useEffect(() => {
    loadProducts();
    loadOutstandingCredits();
    loadCustomers();
  }, []);

  // Listen for background DB changes
  useEffect(() => {
    const handleDataRefresh = () => {
      loadProducts();
      loadOutstandingCredits();
      loadCustomers();
    };

    window.addEventListener("bosco:db-changed", handleDataRefresh);
    return () => window.removeEventListener("bosco:db-changed", handleDataRefresh);
  }, []);

  // Load full product list when searching if not yet fully loaded
  useEffect(() => {
    if (search && !fullLoaded) {
      loadFullProducts();
    }
  }, [search, fullLoaded]);

  const productIndex = useMemo(
    () => new Map(products.map((product) => [product._id, product])),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => (product.name || "").toLowerCase().includes(query));
  }, [products, deferredSearch]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, 120),
    [filteredProducts]
  );

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (product) => product.stock <= (product.lowStockThreshold ?? 2)
    );
  }, [products]);

  const customerCredits = useMemo(() => {
    const customerCreditMap = {};
    outstandingCredits.forEach((entry) => {
      const name = entry.customerName || "Unknown";
      const date = entry.timestamp;
      if (!customerCreditMap[name])
        customerCreditMap[name] = { name, date, entries: [], totalOwed: 0 };

      if (entry.isBulkGroup) {
        const bulkTotal = entry.items.reduce((s, i) => s + (i.total || 0), 0);
        const owed = bulkTotal - (entry.dwnPayment || 0);
        customerCreditMap[name].entries.push({
          owed,
          label: `Bulk (${entry.items.length} items)`,
          detail: entry.items.map((i) => `${i.quantity}×${i.name}`).join(", "),
        });
        customerCreditMap[name].totalOwed += owed;
      } else {
        const owed = (entry.total || 0) - (entry.dwnPayment || 0);
        customerCreditMap[name].entries.push({
          owed,
          label: `${entry.quantity} × ${entry.name}`,
          detail: null,
        });
        customerCreditMap[name].totalOwed += owed;
      }
    });

    return Object.values(customerCreditMap).sort((a, b) => b.totalOwed - a.totalOwed);
  }, [outstandingCredits]);

  const grandCreditTotal = useMemo(
    () => customerCredits.reduce((s, c) => s + c.totalOwed, 0),
    [customerCredits]
  );

  return {
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
    refreshData: loadProducts,
  };
}
