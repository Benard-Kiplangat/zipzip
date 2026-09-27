import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import { formatWhole } from "../utils/format";
import WeeklySummary from "../components/WeeklySummary";
import MonthlySummary from "../components/MonthlySummary";
import SaleList from "../components/SaleList";
import EditSaleModal from "../components/EditSaleModal";
import ProductSummary from "../components/ProductSummary";
import CustomerSummary from "../components/CustomerSummary";
import { useAuth } from "../context/AuthContext";
import { useBusinessConfig } from "../config";

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [editingSale, setEditingSale] = useState(null);
  const [showCreditList, setShowCreditList] = useState(false);
  const [productSummaries, setProductSummaries] = useState({});
  const [summary, setSummary] = useState({ totalSales: 0, totalRevenue: 0, totalProfit: 0 });
  const [viewMode, setViewMode] = useState("todaySales");
  const [selectedSales, setSelectedSales] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [salesSearch, setSalesSearch] = useState("");
  const [searchRange, setSearchRange] = useState("week");
  const [etimsMode, setEtimsMode] = useState(() => {
    return localStorage.getItem("etimsMode") === "true";
  });

  const { config } = useBusinessConfig();

  useEffect(() => {
    loadSales();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadSales(selectedDate);
    };

    window.addEventListener('bosco:db-changed', handleDataRefresh);
    return () => window.removeEventListener('bosco:db-changed', handleDataRefresh);
  }, [selectedDate]);

  const loadSales = async (dateStr) => {
    const usedDate = dateStr || selectedDate;
    const [y, m, d] = usedDate.split('-').map(Number);

    const normalizeSaleId = async () => {
      const docs = await db.allDocs({ 
        include_docs: true,
        attachments: true,
      });

      const sales = docs.rows.map(row => row.doc).filter(doc => doc && doc.type === "sale" && !doc._id.startsWith("sale"));
      
      const ops = [];

      sales.forEach(async (sale) => {
        const newId = `sale_${sale._id}`;
        const newDoc = {
          ...sale,
          _id: newId,
          _rev: undefined,
        }
        const oldDoc = {
          _id: sale._id,
          _rev: sale._rev,
          _deleted: true
        }
        ops.push(newDoc, oldDoc)
      })

      const res = await db.bulkDocs(ops);
      const conflicts = res.filter(r => r.error);
      console.log("renamed:", sales.length, "with", conflicts.length, "conflicts");
      localStorage.setItem("saleIdNormalized", true);
    }

    const normalizeSaleIdElectron = async () => {
      const docs = await db.allDocs({ include_docs: true });
      const sales = docs.rows.map(row => row.doc).filter(doc => doc && doc.type === "sale" && !doc._id.startsWith("sale"));
      sales.forEach(async (sale) => {
        await db.put({...sale, _id: `sale_${sale._id}`})
      })
      localStorage.setItem("saleIdNormalized", true);
      alert("Done!")
    }

    localStorage.getItem("saleIdNormalized") ? "" : window.electronAPI ? normalizeSaleIdElectron() : normalizeSaleId();

    const result = await db.allDocs({
      include_docs: true,
      startkey: "sale",
      endkey: "sale\uffff",
    });

    const salesDocs = result.rows.map(row => row.doc);
    setAllSales(salesDocs);

    const today = new Date(y, m - 1, d).toLocaleDateString();
    const todaySales = salesDocs.filter(sale =>
      new Date(sale.timestamp).toLocaleDateString() === today
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    calculateSummary(todaySales);
    setSales(todaySales);

    const grouped = {};
    salesDocs.forEach(sale => {
      const dateKey = new Date(sale.timestamp).toLocaleDateString();
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(sale);
    });

    const productSummary = {};
    todaySales.forEach(sale => {
      if (!productSummary[sale.name]) {
        productSummary[sale.name] = { quantity: 0, revenue: 0, profit: 0 };
      }
      productSummary[sale.name].quantity += sale.quantity;
      productSummary[sale.name].revenue += sale.total;
      productSummary[sale.name].profit += sale.total - (sale.costPrice * sale.quantity);
    });
    setProductSummaries(productSummary);
  };

  const calculateSummary = (salesList) => {
    let totalSales = 0;
    let totalRevenue = 0;
    let totalDue = 0;
    let totalDownPayment = 0;
    let totalExpectedCreditProfit = 0;
    let totalProfit = 0;

    // Separate normal sales from bulk-sale items
    const normalSales = salesList.filter(
      (sale) => !(sale.isBulkSale && sale.bulkSaleId)
    );

    const bulkGroups = {};

    salesList
      .filter((sale) => sale.isBulkSale && sale.bulkSaleId)
      .forEach((sale) => {
        if (!bulkGroups[sale.bulkSaleId]) {
          bulkGroups[sale.bulkSaleId] = [];
        }

        bulkGroups[sale.bulkSaleId].push(sale);
      });

    // ---------------------------------------------------------
    // NORMAL SALES
    // ---------------------------------------------------------
    normalSales.forEach((sale) => {
      const total = Number(sale.total || 0);
      const quantity = Number(sale.quantity || 0);

      totalSales += quantity;

      if (sale.isCreditSale) {
        const initialDwn = Number(
          sale.initialDwnPayment ??
          sale.dwnPayment ??
          0
        );

        const paymentHistory = Array.isArray(sale.paymentHistory)
          ? sale.paymentHistory
          : [];

        const historyPaid = paymentHistory.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

        const paid = initialDwn + historyPaid;
        const due = Math.max(0, total - paid);

        totalDownPayment += initialDwn;
        totalRevenue += paid;
        totalDue += due;

        const profit = Number(
          sale.profit ||
          (total - (Number(sale.costPrice || 0) * quantity))
        );

        totalExpectedCreditProfit += profit;

        // Credit profit is realized only when fully paid
        if (due <= 0) {
          totalProfit += profit;
        }
      } else {
        totalRevenue += total;

        totalProfit += Number(
          sale.profit ||
          (total - (Number(sale.costPrice || 0) * quantity))
        );
      }
    });

    // ---------------------------------------------------------
    // BULK SALES
    // Each bulkSaleId is counted ONCE
    // ---------------------------------------------------------
    Object.values(bulkGroups).forEach((items) => {
      const firstItem = items[0];

      const bulkTotal = items.reduce(
        (sum, item) => sum + Number(item.total || 0),
        0
      );

      const bulkQuantity = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
      );

      totalSales += bulkQuantity;

      if (firstItem.isCreditSale) {
        // Shared ORIGINAL deposit — only read from first item
        const initialDwn = Number(
          firstItem.initialBulkDwnPayment ??
          firstItem.bulkDwnPayment ??
          firstItem.dwnPayment ??
          0
        );

        // Shared payment history — only read from first item
        const paymentHistory = Array.isArray(firstItem.paymentHistory)
          ? firstItem.paymentHistory
          : [];

        const historyPaid = paymentHistory.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

        const paid = initialDwn + historyPaid;
        const due = Math.max(0, bulkTotal - paid);

        totalDownPayment += initialDwn;
        totalRevenue += paid;
        totalDue += due;

        // Profit from ALL items in the bulk sale
        const bulkProfit = items.reduce(
          (sum, item) => {
            const itemProfit = Number(
              item.profit ||
              (
                Number(item.total || 0) -
                (Number(item.costPrice || 0) * Number(item.quantity || 0))
              )
            );

            return sum + itemProfit;
          },
          0
        );

        totalExpectedCreditProfit += bulkProfit;

        // Only recognize bulk profit once the entire bulk sale is paid
        if (due <= 0) {
          totalProfit += bulkProfit;
        }
      } else {
        // Non-credit bulk sale
        const bulkProfit = items.reduce(
          (sum, item) => {
            const itemProfit = Number(
              item.profit ||
              (
                Number(item.total || 0) -
                (Number(item.costPrice || 0) * Number(item.quantity || 0))
              )
            );

            return sum + itemProfit;
          },
          0
        );

        totalRevenue += bulkTotal;
        totalProfit += bulkProfit;
      }
    });

    setSummary({
      totalSales,
      totalDownPayment,
      totalRevenue,
      totalExpectedCreditProfit,
      totalCreditSales: totalDue,
      totalDue,
      totalProfit,
    });
  };

  const handleDeleteSale = async (sale) => {
    if (window.confirm("Are you sure you want to delete this sale?")) {
      await db.remove(sale);
      loadSales();
    }
  };

  const handleEditSale = async (sale) => {
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
    setEditingSale(prev => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      const qty = Number(next.quantity) || 0;
      const cp = Number(next.costPrice) || 0;
      const tot = Number(next.total) || 0;
      next.profit = tot - (cp * qty);
      return next;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSale) return;
    if (!editingSale.name) { alert('Product name is required'); return; }

    const now = new Date().toISOString();
    const existingHistory = Array.isArray(editingSale.paymentHistory)
      ? editingSale.paymentHistory
      : [];

    const historyPaid = existingHistory.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // dwnPayment is the ORIGINAL deposit
    const initialDwn = Number(
      editingSale.initialDwnPayment ??
      editingSale.dwnPayment ??
      0
    );

    const alreadyPaid = initialDwn + historyPaid;
    const total = Number(editingSale.total) || 0;
    const finalBalance = Math.max(0, total - alreadyPaid);

    // When marking as paid via edit, record the remaining balance as a final payment entry
    const newHistory = (editingSale.isCreditPaid && finalBalance > 0)
      ? [...existingHistory, { amount: finalBalance, date: now, method: "cash", note: "Final payment (Edit)", recordedBy: "Staff" }]
      : existingHistory;

    const toSave = {
      ...editingSale,
      quantity: Number(editingSale.quantity),
      costPrice: Number(editingSale.costPrice),
      total,
      profit: Number(editingSale.profit) || (total - (Number(editingSale.costPrice) * Number(editingSale.quantity))),
      isCreditSale: !!editingSale.isCreditSale,
      isCreditPaid: !!editingSale.isCreditPaid,
      dwnPayment: initialDwn,
      initialDwnPayment: initialDwn,
      paymentHistory: newHistory,
      updatedAt: now,
    };
    try {
      await db.put(toSave);
      setEditingSale(null);
      loadSales();
    } catch (err) {
      console.error('Failed to save sale', err);
      alert('Failed to save sale. See console for details.');
    }
  };

  const handleCancelEdit = () => setEditingSale(null);

  const getPaymentInfo = (sale) => {
    let total = 0;
    let initialDwn = 0;
    let paymentHistory = [];

    if (sale.isBulkGroup) {
      const first = sale.items?.[0];

      total = (sale.items || []).reduce(
        (sum, item) => sum + Number(item.total || 0),
        0
      );

      // dwnPayment is the ORIGINAL deposit
      initialDwn = Number(
        first?.bulkDwnPayment ??
        first?.dwnPayment ??
        0
      );

      paymentHistory = Array.isArray(first?.paymentHistory)
        ? first.paymentHistory
        : [];
    } else {
      total = Number(sale.total || 0);

      // dwnPayment is the ORIGINAL deposit
      initialDwn = Number(
        sale.dwnPayment ??
        0
      );

      paymentHistory = Array.isArray(sale.paymentHistory)
        ? sale.paymentHistory
        : [];
    }

    // All payments AFTER the original deposit
    const historyPaid = paymentHistory.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    // Original deposit + additional payments
    const paid = initialDwn + historyPaid;

    // Amount still owed
    const balance = Math.max(0, total - paid);

    return {
      total,
      paid,
      dwnPayment: initialDwn,
      historyPaid,
      balance,
      paymentHistory,
    };
  };

  const handleTotalCreditSales = (salesList) => {
    const creditSales = salesList.filter((x) => x.isCreditSale);
    const balance = creditSales.reduce(
      (sum, item) => {
        const { balance } = getPaymentInfo(item);
        return balance + sum
      },
      0
    );

    const due = Math.max(0, balance);
    return due;
  };

  const handleLoadSales = async () => {
    try {
      loadSales();
    }
    catch (err) {
      console.error('Failed to reload', err);
      alert('Something went wrong. Please try again.');
    }
  };

  const handleMarkBulkPaid = async (items) => {
    if (!window.confirm(`Mark all ${items.length} items in this bulk credit as paid?`)) return;

    const now = new Date().toISOString();
    const bulkTotal = items.reduce((sum, s) => sum + (s.total || 0), 0);
    const firstItem = items[0];

    // Compute how much has already been paid (initial down + all history entries)
    const existingHistory = Array.isArray(firstItem?.paymentHistory) ? firstItem.paymentHistory : [];
    const historyPaid = existingHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const rawDwn = Number(firstItem?.bulkDwnPayment || firstItem?.dwnPayment || 0);
    const initialDwn = firstItem?.initialBulkDwnPayment !== undefined
      ? Number(firstItem.initialBulkDwnPayment)
      : rawDwn;
    const alreadyPaid = initialDwn + historyPaid;
    const finalBalance = Math.max(0, bulkTotal - alreadyPaid);

    // Build new history with the final payment entry (only if there's a balance remaining)
    const newHistory = finalBalance > 0
      ? [...existingHistory, { amount: finalBalance, date: now, method: "cash", note: "Final payment (Marked Paid)", recordedBy: "Staff" }]
      : existingHistory;

    try {
      for (const item of items) {
        await db.put({
          ...item,
          isCreditPaid: true,
          dwnPayment: initialDwn,
          initialBulkDwnPayment: initialDwn,
          bulkDwnPayment: initialDwn,
          paymentHistory: newHistory,
          updatedAt: now,
        });
      }
      loadSales();
    } catch (err) {
      console.error('Failed to mark bulk as paid', err);
      alert('Something went wrong. Please try again.');
    }
  };

  const handleDeleteSaleWithStockRestore = async (sale) => {
    const confirmed = window.confirm("Delete this sale and update stock?");
    if (!confirmed) return;
    const result = await db.allDocs({ include_docs: true });
    const stockDocs = result.rows.map(row => row.doc).filter(doc => doc.type === "product");
    const stockItem = stockDocs.find(item => item.name === sale.name);
    if (stockItem) {
      stockItem.stock += sale.quantity;
      await db.put(stockItem);
    } else {
      alert("No matching stock item found to update.");
    }
    await db.remove(sale);
    loadSales();
  };

  const toggleSaleSelection = (sale) => {
    setSelectedSales(prev =>
      prev.find(s => s._id === sale._id)
        ? prev.filter(s => s._id !== sale._id)
        : [...prev, sale]
    );
  };

  const isSelected = (sale) => selectedSales.find(s => s._id === sale._id);

  const filteredSales = (() => {
    const q = salesSearch.trim().toLowerCase();
    if (!q) return sales;
    let cutoff = 0;
    if (searchRange === "week") cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    else if (searchRange === "month") cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return allSales.filter(s =>
      new Date(s.timestamp).getTime() >= cutoff &&
      (s.name?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q))
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  })();

  const visibleSales = Boolean(salesSearch) ? filteredSales.slice(0, 120) : filteredSales;

  const { canViewProfit } = useAuth();

  const todayUnits = sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
  const discountTotal = sales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
  const grossSales = summary.totalRevenue + discountTotal;
  const creditSales = sales.filter(sale => sale.isCreditSale);
  const pendingCreditSales = creditSales.filter(sale => !sale.isCreditPaid);
  const creditSalesValue = creditSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const creditSaleDeposits = creditSales.reduce((sum, sale) => (
    sum + (Array.isArray(sale.paymentHistory)
      ? sale.paymentHistory.reduce((payments, payment) => payments + Number(payment.amount || 0), 0)
      : Number(sale.dwnPayment || 0))
  ), 0);
  const normalSalesCount = sales.length - creditSales.length;
  const discountRate = (grossSales && discountTotal) ? (discountTotal / grossSales) * 100 : 0;
  const paymentMethods = sales.reduce((methods, sale) => {
    const method = sale.paymentMethod || (sale.isCreditSale ? "Credit" : "Cash");
    methods[method] = (methods[method] || 0) + Number(sale.total || 0);
    return methods;
  }, {});
  const topPaymentMethod = Object.entries(paymentMethods).sort(([, first], [, second]) => second - first)[0];
  const collectionRate = creditSalesValue
    ? Math.round((creditSaleDeposits / creditSalesValue) * 100)
    : 0;
  const topProducts = Object.entries(productSummaries)
    .sort(([, first], [, second]) => second.revenue - first.revenue)
    .slice(0, 10);

  return (
    <div className="p-4 pb-32 max-w-4xl">
      <div className="text-2xl font-bold text-slate-900 pb-1">
        <h1 className="pb-2">Sales History</h1>
      </div>
      <div>
        <div className="">
          <div className="max-w-xl mb-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <div className="flex gap-1 overflow-x-auto items-center justify-around no-wrap">
              {[
                ["todaySales", "Daily Sales"],
                ["weekly", "Weekly"],
                ["monthly", "Monthly"],
                ["productSummary", "By Product"],
                ["customerSummary", "By Customer"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${viewMode === mode
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "todaySales" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 w-full gap-2">
              <div className="lg:col-span-2 max-w-xl">

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by product or customer..."
                    className="min-w-[75px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    value={salesSearch}
                    onChange={e => setSalesSearch(e.target.value)}
                  />
                  <select
                    value={searchRange}
                    onChange={e => setSearchRange(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="week">Past 7 days</option>
                    <option value="month">Past 30 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-4 shadow-sm py-2 pl-2">
                  <div className="flex items-center gap-4">
                    <span
                      className="flex items-center gap-1 cursor-pointer text-sm text-slate-700 pl-2"
                      onClick={() => setShowCreditList(prev => !prev)}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={showCreditList}
                        className=""
                      />
                      {showCreditList ? "Hide" : "Show"} Credit Sales
                    </span>
                    <div className="max-w-xl flex sm:flex-col items-center gap-1">
                      <label className="flex items-center gap-1 cursor-pointer text-sm text-slate-700 pl-2">
                        <input
                          type="checkbox"
                          checked={etimsMode}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setEtimsMode(enabled);
                            localStorage.setItem("etimsMode", String(enabled));
                          }}
                        />

                        eTIMS (Test)
                      </label>
                    </div>
                  </div>
                  <input
                    className="rounded-lg mx-1 py-1.5 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    type="date"
                    name="datePick"
                    id="datePick"
                    value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); loadSales(e.target.value); }}
                  />
                </div>
                {salesSearch.trim() && (
                  <div className="text-xs pt-1 text-gray-500 mb-2">
                    {filteredSales.length} result{filteredSales.length !== 1 ? "s" : ""} found
                  </div>
                )}

                <SaleList
                  sales={visibleSales}
                  showCreditList={showCreditList}
                  setShowCreditList={setShowCreditList}
                  selectedSales={selectedSales}
                  toggleSaleSelection={toggleSaleSelection}
                  isSelected={isSelected}
                  handleEditSale={handleEditSale}
                  handleDeleteSale={handleDeleteSale}
                  handleDeleteSaleWithStockRestore={handleDeleteSaleWithStockRestore}
                  handleMarkBulkPaid={handleMarkBulkPaid}
                  handleLoadSales={handleLoadSales}
                  getPaymentInfo={getPaymentInfo}
                  etimsMode={etimsMode}
                  config={config}
                />

                <EditSaleModal
                  editingSale={editingSale}
                  handleEditChange={handleEditChange}
                  handleSaveEdit={handleSaveEdit}
                  handleCancelEdit={handleCancelEdit}
                />
              </div>
              <aside className="space-y-3 lg:sticky lg:mt-[-57px] max-w-xl ml-1 lg:min-w-[300px]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales analytics</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">{selectedDate}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      {collectionRate}% collected
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        Ksh {formatWhole(summary.totalRevenue).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{todayUnits} Units sold </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-100 p-3">
                        <p className="text-xs text-slate-500">Total Due</p>
                        <p className="mt-1 truncate text-lg font-bold text-slate-900">
                          Ksh {formatWhole(summary.totalDue).toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 p-3">
                        <p className="text-xs text-slate-500">{canViewProfit ? "Total Profit" : "Gross Sales"}</p>
                        <p className="mt-1 truncate text-lg font-bold text-slate-900">
                          {canViewProfit ? `Ksh. ${formatWhole(summary.totalProfit).toLocaleString()}` : `Ksh ${formatWhole(grossSales).toLocaleString()}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                      <span className="text-slate-500">Credit Sales</span>
                      <span className="font-bold text-sky-700">
                        {creditSales.length} Credit Sales · Ksh {formatWhole(creditSalesValue).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Pending credit sales</span>
                      <span className="font-semibold text-slate-800">{pendingCreditSales.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Discounts given</span>
                      <span className="font-semibold text-slate-800">
                        Ksh {formatWhole(discountTotal).toLocaleString()} ({discountRate.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Credit sale deposits</span>
                      <span className="font-semibold text-emerald-700">
                        Ksh {formatWhole(creditSaleDeposits).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Sales Count</span>
                      <span className="font-semibold text-slate-800">{normalSalesCount}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
        {
          viewMode === "productSummary" && (
            <div className="max-w-xl">
              <ProductSummary productSummaries={productSummaries} allSales={allSales} />
            </div>
          )
        }

        {
          viewMode === "weekly" && (
            <div className="max-w-xl">
              <WeeklySummary allSales={allSales} selectedDate={selectedDate} />
            </div>
          )
        }

        {
          viewMode === "monthly" && (
            <div className="max-w-xl">
              <MonthlySummary allSales={allSales} selectedDate={selectedDate} />
            </div>
          )
        }

        {
          viewMode === "customerSummary" && (
            <div className="max-w-xl">
              <CustomerSummary allSales={allSales} selectedDate={selectedDate} />
            </div>
          )
        }
      </div>
    </div>
  );
}