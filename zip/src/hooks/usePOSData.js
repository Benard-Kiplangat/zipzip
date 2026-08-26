import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../db";

export function usePOSData() {
  const [products, setProducts] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [outstandingCredits, setOutstandingCredits] = useState([]);

  // ==================================================
  // PRODUCTS
  // ==================================================

  const loadFullProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);

      const result = await db.allDocs({
        include_docs: true,
        startkey: "product",
        endkey: "product\uffff",
      });

      const productDocs = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc?.type === "product");

      // Sort once when data is loaded.
      productDocs.sort(
        (a, b) =>
          (Number(b.totalSold) || 0) -
          (Number(a.totalSold) || 0)
      );

      setProducts(productDocs);
      setFullLoaded(true);
    } catch (e) {
      console.error("Failed to load products:", e);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // ==================================================
  // CUSTOMERS
  // ==================================================

  const loadCustomers = useCallback(async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: "customer:",
        endkey: "customer:\uffff",
      });

      const custs = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc?.type === "customer");

      setCustomers(custs);
    } catch (e) {
      console.error("Failed to load customers:", e);
    }
  }, []);

  // ==================================================
  // OUTSTANDING CREDITS
  // ==================================================

  const loadOutstandingCredits = useCallback(async () => {
    try {
      let result;

      /*
       * IMPORTANT:
       *
       * Instead of:
       *
       *   db.allDocs({ include_docs: true })
       *
       * we ask the database for credit sales only.
       */

      try {
        result = await db.find({
          selector: {
            type: "sale",
            isCreditSale: true,
            isCreditPaid: false,
          },
        });
      } catch (findError) {
        /*
         * Fallback for databases that don't have
         * Mango/find enabled.
         */
        console.warn(
          "db.find() failed, falling back to allDocs()",
          findError
        );

        result = await db.allDocs({
          include_docs: true,
        });

        result.rows = result.rows.filter(
          (row) =>
            row.doc?.type === "sale" &&
            row.doc?.isCreditSale &&
            !row.doc?.isCreditPaid
        );
      }

      const sales = result.docs
        ? result.docs
        : result.rows
            .map((row) => row.doc)
            .filter(Boolean);

      // ==================================================
      // Group bulk sales
      // ==================================================

      const entries = [];
      const bulkMap = {};

      sales.forEach((sale) => {
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
      console.error(
        "Failed to load credit sales:",
        e
      );
    }
  }, []);

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    /*
     * These are completely independent operations.
     *
     * Run them concurrently.
     */
    Promise.all([
      loadFullProducts(),
      loadCustomers(),
      loadOutstandingCredits(),
    ]).catch((error) => {
      console.error("Initial POS data load failed:", error);
    });
  }, [
    loadFullProducts,
    loadCustomers,
    loadOutstandingCredits,
  ]);

  // ==================================================
  // DATABASE CHANGE LISTENER
  // ==================================================

  useEffect(() => {
    let refreshTimer = null;

    const handleDataRefresh = () => {
      /*
       * Debounce refreshes.
       *
       * If several database changes happen together,
       * don't reload everything several times.
       */
      clearTimeout(refreshTimer);

      refreshTimer = setTimeout(() => {
        Promise.all([
          loadFullProducts(),
          loadCustomers(),
          loadOutstandingCredits(),
        ]).catch((error) => {
          console.error(
            "Failed to refresh POS data:",
            error
          );
        });
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
  }, [
    loadFullProducts,
    loadCustomers,
    loadOutstandingCredits,
  ]);

  // ==================================================
  // PRODUCT INDEX
  // ==================================================

  const productIndex = useMemo(() => {
    return new Map(
      products.map((product) => [
        product._id,
        product,
      ])
    );
  }, [products]);

  // ==================================================
  // SEARCH
  // ==================================================

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) =>
      (product.name || "")
        .toLowerCase()
        .includes(query)
    );
  }, [products, search]);

  // ==================================================
  // VISIBLE PRODUCTS
  // ==================================================

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, 25);
  }, [filteredProducts]);

  // ==================================================
  // LOW STOCK
  // ==================================================

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (product) =>
        Number(product.stock) <=
        (product.lowStockThreshold ?? 2)
    );
  }, [products]);

  // ==================================================
  // CUSTOMER CREDITS
  // ==================================================

  const customerCredits = useMemo(() => {
    const customerCreditMap = {};

    outstandingCredits.forEach((entry) => {
      const name =
        entry.customerName?.trim() || "Unknown";

      const date =
        entry.timestamp ||
        entry.createdAt ||
        entry.updatedAt ||
        null;

      if (!customerCreditMap[name]) {
        customerCreditMap[name] = {
          name,
          date,
          entries: [],
          total: 0,
          totalPaid: 0,
          totalOwed: 0,
        };
      }

      // ----------------------------------------------
      // Sale total
      // ----------------------------------------------

      let saleTotal = 0;

      if (entry.isBulkGroup) {
        saleTotal = (entry.items || []).reduce(
          (sum, item) => {
            const itemTotal =
              Number(item.total) ||
              (Number(item.price) || 0) *
                (Number(item.quantity) || 0);

            return sum + itemTotal;
          },
          0
        );
      } else {
        saleTotal =
          Number(entry.total) ||
          (Number(entry.price) || 0) *
            (Number(entry.quantity) || 0);
      }

      // ----------------------------------------------
      // Down payment
      // ----------------------------------------------

      const downPayment =
        Number(entry.dwnPayment) || 0;

      // ----------------------------------------------
      // Payment history
      // ----------------------------------------------

      const paymentHistory = Array.isArray(
        entry.paymentHistory
      )
        ? entry.paymentHistory
        : [];

      const historyPaid = paymentHistory.reduce(
        (sum, payment) => {
          const amount =
            Number(payment.amount) ||
            Number(payment.paid) ||
            Number(payment.payment) ||
            0;

          return sum + amount;
        },
        0
      );

      // ----------------------------------------------
      // Paid / owed
      // ----------------------------------------------

      const saleTotalPaid =
        downPayment + historyPaid;

      const saleOwed = Math.max(
        0,
        saleTotal - saleTotalPaid
      );

      customerCreditMap[name].total += saleTotal;
      customerCreditMap[name].totalPaid +=
        saleTotalPaid;
      customerCreditMap[name].totalOwed += saleOwed;

      // ----------------------------------------------
      // Sale entry
      // ----------------------------------------------

      customerCreditMap[name].entries.push({
        owed: saleOwed,
        total: saleTotal,
        totalPaid: saleTotalPaid,
        downPayment,
        historyPaid,
        date,

        detail: entry.isBulkGroup
          ? `${entry.items?.length || 0} Bulk items (${(
              entry.items || []
            )
              .map(
                (item) =>
                  `${Number(item.quantity) || 0} ${
                    item.name || "Unknown item"
                  }`
              )
              .join(", ")})`
          : `${Number(entry.quantity) || 0} ${
              entry.name || "Unknown item"
            }`,
      });
    });

    return Object.values(customerCreditMap)
      .map((customer) => ({
        ...customer,
        totalOwed: Math.max(
          0,
          customer.total - customer.totalPaid
        ),
      }))
      .filter(
        (customer) => customer.totalOwed > 0
      )
      .sort(
        (a, b) =>
          b.totalOwed - a.totalOwed
      );
  }, [outstandingCredits]);

  // ==================================================
  // GRAND CREDIT TOTAL
  // ==================================================

  const grandCreditTotal = useMemo(
    () =>
      customerCredits.reduce(
        (sum, customer) =>
          sum + customer.totalOwed,
        0
      ),
    [customerCredits]
  );

  // ==================================================
  // POPULAR PRODUCTS
  // ==================================================

  const bumpPopular = useCallback((productId) => {
    try {
      const raw =
        localStorage.getItem("popularCounts");

      const map = raw ? JSON.parse(raw) : {};

      map[productId] =
        (map[productId] || 0) + 1;

      localStorage.setItem(
        "popularCounts",
        JSON.stringify(map)
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, []);

  // ==================================================
  // RETURN
  // ==================================================

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

    fullLoaded,
    loadingProducts,

    refreshData: loadFullProducts,
  };
}