import { useState, useEffect, useMemo } from "react";
import { db } from "../db";

export function usePurchaseData() {
  const [products, setProducts] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const loadProducts = async () => {
    try {
      const res = await db.allDocs({
        include_docs: true,
        startkey: "product",
        endkey: "product\uffff",
      });
      const prods = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === "product");
      setProducts(prods.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } catch (e) {
      console.error("Failed to load products", e);
    }
  };

  const loadPurchases = async () => {
    try {
      const res = await db.allDocs({
        include_docs: true,
        startkey: "purchase:",
        endkey: "purchase:\uffff",
      });
      const purchases = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === "purchase");
      setPurchaseHistory(purchases.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (e) {
      console.error("Failed to load purchase history", e);
    }
  };

  const loadData = async () => {
    await Promise.all([loadProducts(), loadPurchases()]);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadData();
    };

    window.addEventListener("bosco:db-changed", handleDataRefresh);
    return () => window.removeEventListener("bosco:db-changed", handleDataRefresh);
  }, []);

  const createPurchaseRecord = async ({ productId, name, quantity, costPrice }) => {
    const record = {
      _id: `purchase:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
      type: "purchase",
      productId,
      name,
      quantity,
      costPrice,
      totalCost: quantity * costPrice,
      date: new Date().toISOString(),
    };
    await db.put(record);
    return record;
  };

  const addStockToProduct = async (productId, quantityToAdd) => {
    const qty = Number(quantityToAdd) || 1;
    const prod = products.find((p) => p._id === productId);
    if (!prod) throw new Error("Product not found");

    const newStock = (Number(prod.stock) || 0) + qty;
    const updatedProd = { ...prod, stock: newStock };

    await db.put(updatedProd);
    await createPurchaseRecord({
      productId: prod._id,
      name: prod.name,
      quantity: qty,
      costPrice: prod.costPrice || 0,
    });

    await loadData();
    return { name: prod.name, newStock, addedQty: qty };
  };

  const bulkImportStock = async (bulkText) => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new Error("Please paste at least one valid line.");
    }

    let processedCount = 0;

    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 4) {
        console.warn("Skipping invalid line:", line);
        continue;
      }
      const name = parts[0];
      const costPrice = parseFloat(parts[1]) || 0;
      const sellingPrice = parseFloat(parts[2]) || 0;
      const qty = parseInt(parts[3], 10) || 0;

      const existing = products.find(
        (p) => (p.name || "").toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        existing.stock = (Number(existing.stock) || 0) + qty;
        existing.costPrice = costPrice || existing.costPrice;
        existing.sellingPrice = sellingPrice || existing.sellingPrice;
        await db.put(existing);
        await createPurchaseRecord({
          productId: existing._id,
          name: existing.name,
          quantity: qty,
          costPrice: costPrice || existing.costPrice || 0,
        });
        processedCount++;
      } else {
        const doc = {
          _id: `product_${Date.now()}:${Math.floor(Math.random() * 1000)}`,
          type: "product",
          name,
          costPrice,
          sellingPrice,
          stock: qty,
        };
        await db.put(doc);
        await createPurchaseRecord({
          productId: doc._id,
          name: doc.name,
          quantity: qty,
          costPrice: doc.costPrice,
        });
        processedCount++;
      }
    }

    await loadData();
    return processedCount;
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) => p.name && p.name.toLowerCase().includes(query));
  }, [products, search]);

  const sortedPurchases = useMemo(
    () => [...purchaseHistory].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [purchaseHistory]
  );

  // Time calculations
  const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  };

  const isSameDay = (a, b) => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const today = [];
    const thisWeek = [];
    const thisMonth = [];

    sortedPurchases.forEach((purchase) => {
      const purchaseDate = new Date(purchase.date);
      if (isSameDay(purchaseDate, now)) {
        today.push(purchase);
      }
      if (purchaseDate >= weekStart) {
        thisWeek.push(purchase);
      }
      if (
        purchaseDate.getMonth() === now.getMonth() &&
        purchaseDate.getFullYear() === now.getFullYear()
      ) {
        thisMonth.push(purchase);
      }
    });

    const sumCost = (items) => items.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);

    return {
      todayCount: today.length,
      todayTotal: sumCost(today),
      weekCount: thisWeek.length,
      weekTotal: sumCost(thisWeek),
      monthCount: thisMonth.length,
      monthTotal: sumCost(thisMonth),
    };
  }, [sortedPurchases]);

  const filteredPurchases = useMemo(() => {
    const rangeStart = new Date(dateFrom + "T00:00:00");
    const rangeEnd = new Date(dateTo + "T23:59:59");
    return sortedPurchases.filter((p) => {
      const d = new Date(p.date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [sortedPurchases, dateFrom, dateTo]);

  return {
    products,
    filteredProducts,
    search,
    setSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    metrics,
    filteredPurchases,
    addStockToProduct,
    bulkImportStock,
    refreshData: loadData,
  };
}
