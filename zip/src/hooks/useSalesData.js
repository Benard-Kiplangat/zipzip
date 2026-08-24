import { useState, useEffect, useMemo } from "react";
import { db } from "../db";

export function useSalesData() {
  const [sales, setSales] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [editingSale, setEditingSale] = useState(null);
  const [showCreditList, setShowCreditList] = useState(false);
  const [productSummaries, setProductSummaries] = useState({});
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalCreditSales: 0,
    totalDownPayment: 0,
    totalExpectedCreditProfit: 0,
  });
  const [viewMode, setViewMode] = useState("todaySales");
  const [selectedSales, setSelectedSales] = useState([]);
  const [salesSearch, setSalesSearch] = useState("");
  const [searchRange, setSearchRange] = useState("week");

  const calculateSummary = (salesList) => {
    const totalDownPayment = salesList
      .filter((x) => x.isCreditSale)
      .reduce((sum, s) => sum + (s.dwnPayment || 0), 0);
    const totalExpectedCreditProfit = salesList
      .filter((x) => x.isCreditSale)
      .reduce((sum, s) => sum + (s.profit || 0), 0);
    const totalSales = salesList.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const totalCreditSales =
      salesList
        .filter((x) => x.isCreditSale)
        .reduce((sum, s) => sum + (s.total || 0), 0) - totalDownPayment;
    const totalRevenue =
      salesList
        .filter((x) => !x.isCreditSale)
        .reduce((sum, s) => sum + (s.total || 0), 0) + totalDownPayment;
    const totalProfit =
      salesList.reduce((sum, s) => sum + (s.profit || 0), 0) -
      totalExpectedCreditProfit +
      salesList
        .filter((x) => x.isCreditPaid)
        .reduce((sum, s) => sum + (s.profit || 0), 0);

    setSummary({
      totalSales,
      totalDownPayment,
      totalRevenue,
      totalExpectedCreditProfit,
      totalCreditSales,
      totalProfit,
    });
  };

  const loadSales = async (dateStr) => {
    try {
      const usedDate = dateStr || selectedDate;
      const [y, m, d] = usedDate.split("-").map(Number);

      const result = await db.allDocs({ include_docs: true });
      const salesDocs = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === "sale");
      setAllSales(salesDocs);

      const today = new Date(y, m - 1, d).toLocaleDateString();
      const todaySales = salesDocs.filter(
        (sale) => new Date(sale.timestamp).toLocaleDateString() === today
      );

      calculateSummary(todaySales);
      setSales(todaySales);

      const productSummary = {};
      todaySales.forEach((sale) => {
        if (!productSummary[sale.name]) {
          productSummary[sale.name] = { quantity: 0, revenue: 0, profit: 0 };
        }
        productSummary[sale.name].quantity += sale.quantity;
        productSummary[sale.name].revenue += sale.total;
        productSummary[sale.name].profit +=
          sale.total - sale.costPrice * sale.quantity;
      });
      setProductSummaries(productSummary);
    } catch (err) {
      console.error("Failed to load sales", err);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadSales(selectedDate);
    };

    window.addEventListener("bosco:db-changed", handleDataRefresh);
    return () => window.removeEventListener("bosco:db-changed", handleDataRefresh);
  }, [selectedDate]);

  const deleteSale = async (sale) => {
    await db.remove(sale);
    await loadSales();
  };

  const deleteSaleWithStockRestore = async (sale) => {
    const result = await db.allDocs({ include_docs: true });
    const stockDocs = result.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === "product");
    const stockItem = stockDocs.find((item) => item.name === sale.name);

    if (stockItem) {
      stockItem.stock += sale.quantity;
      await db.put(stockItem);
    } else {
      throw new Error("No matching stock item found to update stock quantity.");
    }
    await db.remove(sale);
    await loadSales();
  };

  const markBulkPaid = async (items) => {
    const bulkTotal = items.reduce((sum, s) => sum + (s.total || 0), 0);
    for (const item of items) {
      await db.put({
        ...item,
        isCreditPaid: true,
        dwnPayment: item.total,
        bulkDwnPayment: bulkTotal,
      });
    }
    await loadSales();
  };

  const handleEditSale = (sale) => {
    setEditingSale({
      ...sale,
      quantity: Number(sale.quantity) || 0,
      costPrice: Number(sale.costPrice) || 0,
      total: Number(sale.total) || 0,
      isCreditSale: !!sale.isCreditSale,
      isCreditPaid: !!sale.isCreditPaid,
    });
  };

  const handleEditChange = (field, value) => {
    setEditingSale((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      const qty = Number(next.quantity) || 0;
      const cp = Number(next.costPrice) || 0;
      const tot = Number(next.total) || 0;
      next.profit = tot - cp * qty;
      return next;
    });
  };

  const saveEditSale = async () => {
    if (!editingSale) return;
    if (!editingSale.name) {
      throw new Error("Product name is required.");
    }
    const toSave = {
      ...editingSale,
      quantity: Number(editingSale.quantity),
      costPrice: Number(editingSale.costPrice),
      total: Number(editingSale.total),
      profit:
        Number(editingSale.profit) ||
        Number(editingSale.total) -
          Number(editingSale.costPrice) * Number(editingSale.quantity),
      isCreditSale: !!editingSale.isCreditSale,
      isCreditPaid: !!editingSale.isCreditPaid,
      dwnPayment: editingSale.isCreditPaid
        ? editingSale.total
        : editingSale.dwnPayment,
    };

    await db.put(toSave);
    setEditingSale(null);
    await loadSales();
  };

  const cancelEditSale = () => setEditingSale(null);

  const toggleSaleSelection = (sale) => {
    setSelectedSales((prev) =>
      prev.find((s) => s._id === sale._id)
        ? prev.filter((s) => s._id !== sale._id)
        : [...prev, sale]
    );
  };

  const isSelected = (sale) => !!selectedSales.find((s) => s._id === sale._id);

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    const list = [...sales].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    if (!q) return list;

    return list.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.customerName?.toLowerCase().includes(q)
    );
  }, [sales, salesSearch]);

  return {
    sales,
    allSales,
    selectedDate,
    setSelectedDate,
    editingSale,
    showCreditList,
    setShowCreditList,
    productSummaries,
    summary,
    viewMode,
    setViewMode,
    selectedSales,
    salesSearch,
    setSalesSearch,
    searchRange,
    setSearchRange,
    filteredSales,
    isSelected,
    toggleSaleSelection,
    handleEditSale,
    handleEditChange,
    saveEditSale,
    cancelEditSale,
    deleteSale,
    deleteSaleWithStockRestore,
    markBulkPaid,
    reloadSales: loadSales,
  };
}
