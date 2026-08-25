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
  const [groupedSummaries, setGroupedSummaries] = useState({});
  const [selectedSales, setSelectedSales] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [salesSearch, setSalesSearch] = useState("");
  const [searchRange, setSearchRange] = useState("week");

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

    const result = await db.allDocs({ include_docs: true });
    const salesDocs = result.rows.map(row => row.doc).filter(doc => doc && doc.type === "sale");
    setAllSales(salesDocs);

    const today = new Date(y, m - 1, d).toLocaleDateString();
    const todaySales = salesDocs.filter(sale =>
      new Date(sale.timestamp).toLocaleDateString() === today
    );

    calculateSummary(todaySales);
    setSales(todaySales);

    function groupSales(sales) {
      const ordered = [...sales];
      const result = [];
      const bulkMap = {};
    
      ordered.forEach((sale) => {
        if (sale.isBulkSale && sale.bulkSaleId) {
          if (!bulkMap[sale.bulkSaleId]) {
            const group = {
              isBulkGroup: true,
              bulkSaleId: sale.bulkSaleId,
              timestamp: sale.timestamp,
              items: [],
            };
            bulkMap[sale.bulkSaleId] = group;
            result.push(group);
          }
          bulkMap[sale.bulkSaleId].items.push(sale);
        } else {
          result.push(sale);
        }
      });
    
      return result;
    }
  
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

    const summaryByDate = {};
    for (let date in grouped) {
      const totalCreditSales = handleTotalCreditSales(grouped[date]);
      const total = grouped[date].reduce((acc, sale) => ({
        totalSales: acc.totalSales + sale.quantity,
        totalRevenue: acc.totalRevenue + sale.total,
        creditSales: totalCreditSales,
        totalProfit: acc.totalProfit + (sale.total - sale.costPrice * sale.quantity)
      }), { totalSales: 0, totalRevenue: 0, creditSales: 0, totalProfit: 0 });
      summaryByDate[date] = total;
    }
    setGroupedSummaries(summaryByDate);
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
      : Math.max(0, rawDwn - historyPaid);
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

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    const list = [...sales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!q) return list;

    return list.filter(s =>
      (s.name?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q))
    );
  }, [sales, salesSearch]);

  const visibleSales = filteredSales.slice(0, 120);

  const { canViewProfit } = useAuth();

  return (
    <div className="p-4 pb-32 max-w-xl">
      <h1 className="text-xl font-bold mb-4">Sales Histories</h1>

      <div className="mb-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
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
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                viewMode === mode
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
        <div>
          <div className="mb-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Revenue</p>
                <p className="mt-0.5 truncate text-lg font-bold text-slate-900">KES {formatWhole(summary.totalRevenue).toLocaleString()}.00</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Due</p>
                <p className="mt-0.5 truncate text-lg font-bold text-amber-600">KES {formatWhole(summary.totalDue).toLocaleString()}.00</p>
              </div>

              {canViewProfit && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Profit</p>
                  <p className="mt-0.5 truncate text-lg font-bold text-emerald-600">KES {formatWhole(summary.totalProfit).toLocaleString()}.00</p>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl mb-2 border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowCreditList(prev => !prev)}
                className={`inline-flex items-center rounded border ml-4 px-4 py-1.5 text-sm font-semibold transition ${
                  showCreditList
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input type="checkbox" name="" className="mr-1" id="" readOnly checked={showCreditList ? true : false}/>
                {showCreditList ? "Hide" : "Show"} Credit Sales
              </button>
              <div className="">
                <span className="text-sm font-semibold text-slate-700">Sales date: </span>              
                <input
                  className="rounded-lg py-1.5 border ml-2 border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  type="date"
                  name="datePick"
                  id="datePick"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); loadSales(e.target.value); }}
                />
              </div>
            </div>
          </div>

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
          {salesSearch.trim() && (
            <div className="text-xs text-gray-500 mb-2">
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
          />

          <EditSaleModal
            editingSale={editingSale}
            handleEditChange={handleEditChange}
            handleSaveEdit={handleSaveEdit}
            handleCancelEdit={handleCancelEdit}
          />
        </div>
      )}

      {viewMode === "productSummary" && (
        <ProductSummary productSummaries={productSummaries} allSales={allSales} />
      )}

      {viewMode === "weekly" && (
        <WeeklySummary allSales={allSales} selectedDate={selectedDate} />
      )}

      {viewMode === "monthly" && (
        <MonthlySummary allSales={allSales} selectedDate={selectedDate} />
      )}

      {viewMode === "customerSummary" && (
        <CustomerSummary allSales={allSales} selectedDate={selectedDate} />
      )}
    </div>
  );
}