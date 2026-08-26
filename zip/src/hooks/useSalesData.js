import { useState, useEffect, useMemo, useCallback } from "react";
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

  // =========================================================
  // DATE HELPERS
  // =========================================================

  const getDateRange = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);

    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  };

  // =========================================================
  // SUMMARY
  // =========================================================

  const calculateSummary = useCallback((salesList) => {
    let totalSales = 0;
    let totalDownPayment = 0;
    let totalCreditSalesGross = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalExpectedCreditProfit = 0;

    for (const sale of salesList) {
      const quantity = Number(sale.quantity) || 0;
      const total = Number(sale.total) || 0;
      const profit = Number(sale.profit) || 0;
      const downPayment = Number(sale.dwnPayment) || 0;

      totalSales += quantity;

      if (sale.isCreditSale) {
        totalDownPayment += downPayment;
        totalCreditSalesGross += total;
        totalExpectedCreditProfit += profit;

        if (sale.isCreditPaid) {
          totalProfit += profit;
        }
      } else {
        totalRevenue += total;
        totalProfit += profit;
      }
    }

    setSummary({
      totalSales,
      totalDownPayment,
      totalRevenue: totalRevenue + totalDownPayment,
      totalExpectedCreditProfit,
      totalCreditSales:
        totalCreditSalesGross - totalDownPayment,
      totalProfit,
    });
  }, []);

  // =========================================================
  // PRODUCT SUMMARY
  // =========================================================

  const calculateProductSummaries = useCallback((salesList) => {
    const productSummary = {};

    for (const sale of salesList) {
      const name = sale.name || "Unknown";
      const quantity = Number(sale.quantity) || 0;
      const total = Number(sale.total) || 0;
      const costPrice = Number(sale.costPrice) || 0;

      if (!productSummary[name]) {
        productSummary[name] = {
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
      }

      productSummary[name].quantity += quantity;
      productSummary[name].revenue += total;

      productSummary[name].profit +=
        total - costPrice * quantity;
    }

    setProductSummaries(productSummary);
  }, []);

  // =========================================================
  // LOAD TODAY'S SALES
  // =========================================================

  const loadSales = useCallback(
    async (dateStr) => {
      try {
        const usedDate = dateStr || selectedDate;

        const { start, end } = getDateRange(usedDate);

        let result;

        try {
          /*
           * IMPORTANT:
           *
           * This only asks the database for sales
           * belonging to the requested date.
           */
          result = await db.find({
            selector: {
              type: "sale",
              timestamp: {
                $gte: start,
                $lt: end,
              },
            },
          });
        } catch (findError) {
          /*
           * Fallback for older DB configuration.
           *
           * This is slower, but keeps the hook working.
           */
          console.warn(
            "Sales index/query unavailable. Falling back to allDocs.",
            findError
          );

          const fallback = await db.allDocs({
            include_docs: true,
          });

          result = {
            docs: fallback.rows
              .map((row) => row.doc)
              .filter((doc) => {
                if (!doc || doc.type !== "sale") {
                  return false;
                }

                const timestamp = new Date(
                  doc.timestamp
                );

                return (
                  timestamp >= new Date(start) &&
                  timestamp < new Date(end)
                );
              }),
          };
        }

        const todaySales = (result.docs || [])
          .filter((sale) => sale?.type === "sale")
          .sort(
            (a, b) =>
              new Date(b.timestamp) -
              new Date(a.timestamp)
          );

        /*
         * Keep today's sales in both states for compatibility.
         *
         * If another part of your UI expects allSales to
         * contain the complete history, use loadAllSales()
         * below instead.
         */
        setSales(todaySales);
        setAllSales(todaySales);

        calculateSummary(todaySales);
        calculateProductSummaries(todaySales);
      } catch (err) {
        console.error(
          "Failed to load sales:",
          err
        );
      }
    },
    [
      selectedDate,
      calculateSummary,
      calculateProductSummaries,
    ]
  );

  // =========================================================
  // LOAD ALL SALES
  //
  // Call this only when you actually need historical sales.
  // =========================================================

  const loadAllSales = useCallback(async () => {
    try {
      const result = await db.find({
        selector: {
          type: "sale",
        },
      });

      const docs = (result.docs || []).sort(
        (a, b) =>
          new Date(b.timestamp) -
          new Date(a.timestamp)
      );

      setAllSales(docs);

      return docs;
    } catch (error) {
      console.error(
        "Failed to load all sales:",
        error
      );

      return [];
    }
  }, []);

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadSales(selectedDate);
  }, [selectedDate, loadSales]);

  // =========================================================
  // DATABASE CHANGE LISTENER
  // =========================================================

  useEffect(() => {
    let refreshTimer = null;

    const handleDataRefresh = () => {
      clearTimeout(refreshTimer);

      /*
       * If several writes happen together, wait 150ms
       * and refresh only once.
       */
      refreshTimer = setTimeout(() => {
        loadSales(selectedDate);
      }, 150);
    };

    window.addEventListener(
      "bosco:db-changed",
      handleDataRefresh
    );

    return () => {
      window.removeEventListener(
        "bosco:db-changed",
        handleDataRefresh
      );

      clearTimeout(refreshTimer);
    };
  }, [selectedDate, loadSales]);

  // =========================================================
  // DELETE SALE
  // =========================================================

  const deleteSale = async (sale) => {
    await db.remove(sale);

    /*
     * Refresh only the selected day's sales.
     */
    await loadSales(selectedDate);
  };

  // =========================================================
  // DELETE SALE + RESTORE STOCK
  // =========================================================

  const deleteSaleWithStockRestore = async (sale) => {
    /*
     * Don't scan the entire database for products.
     *
     * If your product _id is known, use db.get().
     *
     * We don't know the exact product ID from this sale,
     * so use a targeted Mango query instead.
     */

    let stockItem = null;

    try {
      const result = await db.find({
        selector: {
          type: "product",
          name: sale.name,
        },
        limit: 1,
      });

      stockItem = result.docs?.[0] || null;
    } catch (error) {
      console.error(
        "Failed to find product:",
        error
      );
    }

    if (!stockItem) {
      throw new Error(
        "No matching stock item found to update stock quantity."
      );
    }

    stockItem.stock =
      (Number(stockItem.stock) || 0) +
      (Number(sale.quantity) || 0);

    await db.put(stockItem);

    await db.remove(sale);

    await loadSales(selectedDate);
  };

  // =========================================================
  // MARK BULK PAID
  // =========================================================

  const markBulkPaid = async (items) => {
    const bulkTotal = items.reduce(
      (sum, sale) =>
        sum + (Number(sale.total) || 0),
      0
    );

    /*
     * Perform writes sequentially to preserve the
     * existing behavior.
     *
     * If your db supports bulkDocs(), this can be
     * made considerably faster.
     */

    const updatedItems = items.map((item) => ({
      ...item,
      isCreditPaid: true,
      dwnPayment: item.total,
      bulkDwnPayment: bulkTotal,
    }));

    if (db.bulkDocs) {
      await db.bulkDocs(updatedItems);
    } else {
      for (const item of updatedItems) {
        await db.put(item);
      }
    }

    await loadSales(selectedDate);
  };

  // =========================================================
  // EDIT SALE
  // =========================================================

  const handleEditSale = (sale) => {
    setEditingSale({
      ...sale,

      quantity:
        Number(sale.quantity) || 0,

      costPrice:
        Number(sale.costPrice) || 0,

      total:
        Number(sale.total) || 0,

      isCreditSale:
        !!sale.isCreditSale,

      isCreditPaid:
        !!sale.isCreditPaid,
    });
  };

  // =========================================================
  // EDIT CHANGE
  // =========================================================

  const handleEditChange = (field, value) => {
    setEditingSale((prev) => {
      if (!prev) return prev;

      const next = {
        ...prev,
        [field]: value,
      };

      const quantity =
        Number(next.quantity) || 0;

      const costPrice =
        Number(next.costPrice) || 0;

      const total =
        Number(next.total) || 0;

      next.profit =
        total - costPrice * quantity;

      return next;
    });
  };

  // =========================================================
  // SAVE EDIT
  // =========================================================

  const saveEditSale = async () => {
    if (!editingSale) return;

    if (!editingSale.name) {
      throw new Error(
        "Product name is required."
      );
    }

    const quantity =
      Number(editingSale.quantity) || 0;

    const costPrice =
      Number(editingSale.costPrice) || 0;

    const total =
      Number(editingSale.total) || 0;

    const toSave = {
      ...editingSale,

      quantity,
      costPrice,
      total,

      profit:
        Number(editingSale.profit) ||
        total - costPrice * quantity,

      isCreditSale:
        !!editingSale.isCreditSale,

      isCreditPaid:
        !!editingSale.isCreditPaid,

      dwnPayment:
        editingSale.isCreditPaid
          ? total
          : editingSale.dwnPayment,
    };

    await db.put(toSave);

    setEditingSale(null);

    await loadSales(selectedDate);
  };

  const cancelEditSale = () => {
    setEditingSale(null);
  };

  // =========================================================
  // SALE SELECTION
  // =========================================================

  const toggleSaleSelection = (sale) => {
    setSelectedSales((prev) =>
      prev.find(
        (s) => s._id === sale._id
      )
        ? prev.filter(
            (s) => s._id !== sale._id
          )
        : [...prev, sale]
    );
  };

  const isSelected = (sale) =>
    !!selectedSales.find(
      (s) => s._id === sale._id
    );

  // =========================================================
  // SEARCH
  // =========================================================

  const filteredSales = useMemo(() => {
    const q = salesSearch
      .trim()
      .toLowerCase();

    if (!q) {
      return sales;
    }

    return sales.filter(
      (sale) =>
        sale.name
          ?.toLowerCase()
          .includes(q) ||
        sale.customerName
          ?.toLowerCase()
          .includes(q)
    );
  }, [sales, salesSearch]);

  // =========================================================
  // RETURN
  // =========================================================

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
    loadAllSales,
  };
}