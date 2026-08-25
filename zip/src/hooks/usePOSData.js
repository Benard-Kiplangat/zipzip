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

  const filtered = query
    ? products.filter((product) =>
        (product.name || "").toLowerCase().includes(query)
      )
    : products;

  return [...filtered].sort(
    (a, b) => (Number(b.totalSold) || 0) - (Number(a.totalSold) || 0)
  );
}, [products, deferredSearch]);

const visibleProducts = useMemo(
  () => filteredProducts.slice(0, 25),
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
    const name = entry.customerName?.trim() || "Unknown";
    const date =
      entry.timestamp ||
      entry.createdAt ||
      entry.updatedAt ||
      entry.createdAt ||
      null;

    if (!customerCreditMap[name]) {
      customerCreditMap[name] = {
        name,
        date,
        entries: [],
        total: 0,       // Total value of credit sales
        totalPaid: 0,   // Down payments + payment history
        totalOwed: 0,   // Total - totalPaid
      };
    }

    // --------------------------------------------------
    // 1. Calculate the total value of this sale
    // --------------------------------------------------
    let saleTotal = 0;

    if (entry.isBulkGroup) {
      saleTotal = (entry.items || []).reduce((sum, item) => {
        const itemTotal =
          Number(item.total) ||
          (Number(item.price) || 0) * (Number(item.quantity) || 0);

        return sum + itemTotal;
      }, 0);
    } else {
      saleTotal =
        Number(entry.total) ||
        (Number(entry.price) || 0) * (Number(entry.quantity) || 0);
    }

    // --------------------------------------------------
    // 2. Calculate down payment
    // --------------------------------------------------
    const downPayment = Number(entry.dwnPayment) || 0;

    // --------------------------------------------------
    // 3. Calculate payment history
    // --------------------------------------------------
    const paymentHistory = Array.isArray(entry.paymentHistory)
      ? entry.paymentHistory
      : [];

    const historyPaid = paymentHistory.reduce((sum, payment) => {
      // Supports:
      // { amount: 500 }
      // { paid: 500 }
      // { payment: 500 }
      const amount =
        Number(payment.amount) ||
        Number(payment.paid) ||
        Number(payment.payment) ||
        0;

      return sum + amount;
    }, 0);

    // --------------------------------------------------
    // 4. Total paid for this sale
    // --------------------------------------------------
    const saleTotalPaid = downPayment + historyPaid;

    // Don't allow payments to make the sale negative.
    const saleOwed = Math.max(0, saleTotal - saleTotalPaid);

    // --------------------------------------------------
    // 5. Add sale to customer's totals
    // --------------------------------------------------
    customerCreditMap[name].total += saleTotal;
    customerCreditMap[name].totalPaid += saleTotalPaid;
    customerCreditMap[name].totalOwed += saleOwed;

    // --------------------------------------------------
    // 6. Keep the individual sale for display
    // --------------------------------------------------
    customerCreditMap[name].entries.push({
      owed: saleOwed,
      total: saleTotal,
      totalPaid: saleTotalPaid,
      downPayment,
      historyPaid,
      date,

      detail: entry.isBulkGroup
        ? `${entry.items?.length || 0} Bulk items (${(entry.items || [])
            .map(
              (item) =>
                `${Number(item.quantity) || 0} ${item.name || "Unknown item"}`
            )
            .join(", ")})`
        : `${Number(entry.quantity) || 0} ${entry.name || "Unknown item"}`,
    });
  });

  // --------------------------------------------------
  // 7. Calculate final customer balances
  // --------------------------------------------------
  return Object.values(customerCreditMap)
    .map((customer) => ({
      ...customer,

      // Make absolutely sure the final balance is:
      // total sales - all payments
      totalOwed: Math.max(
        0,
        customer.total - customer.totalPaid
      ),
    }))
    .filter((customer) => customer.totalOwed > 0)
    .sort((a, b) => b.totalOwed - a.totalOwed);
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
