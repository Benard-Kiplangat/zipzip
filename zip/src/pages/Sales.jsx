// Sales.jsx
import React, { useEffect, useState } from "react";
import { db } from "../db";
import { generateReceipt } from "../utils/generateReceipt";
import WeeklySummary from "../components/WeeklySummary";
import MonthlySummary from "../components/MonthlySummary";
import SaleList from "../components/SaleList";
import EditSaleModal from "../components/EditSaleModal";
import ProductSummary from "../components/ProductSummary";

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    // default to today in yyyy-mm-dd format for the date input
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
  const [viewMode, setViewMode] = useState("todaySales"); // "todaySales", "productSummary", "weekly", "monthly"
  const [groupedSummaries, setGroupedSummaries] = useState({});
  const [selectedSales, setSelectedSales] = useState([]);
  const [allSales, setAllSales] = useState([]);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async (dateStr) => {
    const result = await db.allDocs({ include_docs: true });
    const salesDocs = result.rows.map(row => row.doc).filter(doc => doc.type === "sale");
    setAllSales(salesDocs);
    // Use the provided dateStr (yyyy-mm-dd) or the selectedDate state value
    const usedDate = dateStr || selectedDate;
    // Convert yyyy-mm-dd -> Date and then to locale date string for comparison
    const [y, m, d] = usedDate.split('-').map(Number);
    const today = new Date(y, m - 1, d).toLocaleDateString();

    // Filter only today
    const todaySales = salesDocs.filter(sale =>
      new Date(sale.timestamp).toLocaleDateString() === today
    );

    calculateSummary(todaySales);
    setSales(todaySales);

    // Group sales by date for summaries
    const grouped = {};
    salesDocs.forEach(sale => {
      const dateKey = new Date(sale.timestamp).toLocaleDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
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
      const total = grouped[date].reduce((acc, sale) => {
        return {
          totalSales: acc.totalSales + sale.quantity,
          totalRevenue: acc.totalRevenue + sale.total,
          creditSales: totalCreditSales,
          totalProfit: acc.totalProfit + (sale.total - sale.costPrice * sale.quantity)
        };
      }, { totalSales: 0, totalRevenue: 0, creditSales: 0, totalProfit: 0 });
      summaryByDate[date] = total;
    }

    setGroupedSummaries(summaryByDate);
  };

  const calculateSummary = (salesList) => {
    const totalDownPayment = salesList.filter((x) => x.isCreditSale).reduce((sum, s) => sum + s.dwnPayment || 0, 0);
    const totalExpectedCreditProfit = salesList.filter((x) => x.isCreditSale).reduce((sum, s) => sum + s.profit, 0);
    const totalSales = salesList.reduce((sum, s) => sum + s.quantity, 0);
    const totalCreditSales = salesList.filter((x) => x.isCreditSale).reduce((sum, s) => sum + s.total, 0) - totalDownPayment;
    const totalRevenue = (salesList.filter((x) => !x.isCreditSale).reduce((sum, s) => sum + s.total, 0)) + totalDownPayment;
    const totalProfit = (salesList.reduce((sum, s) => sum + s.profit, 0)) - totalExpectedCreditProfit + (salesList.filter((x) => x.isCreditPaid).reduce((sum, s) => sum + s.profit, 0));
    setSummary({ totalSales, totalDownPayment, totalRevenue, totalExpectedCreditProfit, totalCreditSales, totalProfit });
  };

  const handleDeleteSale = async (sale) => {
    if (window.confirm("Are you sure you want to delete this sale?")) {
      await db.remove(sale);
      loadSales();
    }
  };

  const handleEditSale = async (sale) => {
    // Open edit modal with a shallow copy
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
    if (!editingSale.name) {
      alert('Product name is required');
      return;
    }
    const toSave = {
      ...editingSale,
      quantity: Number(editingSale.quantity),
      costPrice: Number(editingSale.costPrice),
      total: Number(editingSale.total),
      profit: Number(editingSale.profit) || (Number(editingSale.total) - (Number(editingSale.costPrice) * Number(editingSale.quantity))),
      isCreditSale: !!editingSale.isCreditSale,
      isCreditPaid: !!editingSale.isCreditPaid,
      dwnPayment: editingSale.isCreditPaid ? editingSale.total : editingSale.dwnPayment,
    };
    try {
      await db.put(toSave);
      setEditingSale(null);
      // reload using current selectedDate
      loadSales();
    } catch (err) {
      console.error('Failed to save sale', err);
      alert('Failed to save sale. See console for details.');
    }
  };

  const handleCancelEdit = () => setEditingSale(null);

  const handleTotalCreditSales = (salesList) => {
    const totalCreditSales = salesList.filter((x) => x.isCreditSale).reduce((sum, s) => sum + s.total, 0) - summary.totalDownPayment;
    return totalCreditSales;
  }

  const handleDeleteSaleWithStockRestore = async (sale) => {
    const confirmed = window.confirm("Delete this sale and update stock?");
    if (!confirmed) return;

    // Get all stock items
    const result = await db.allDocs({ include_docs: true });
    const stockDocs = result.rows.map(row => row.doc).filter(doc => doc.type === "product");

    // Find the stock item by name
    const stockItem = stockDocs.find(item => item.name === sale.name);

    if (stockItem) {
      stockItem.stock += sale.quantity;
      await db.put(stockItem);
    } else {
      alert("No matching stock item found to update.");
    }

    // Delete the sale
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

  return (
    <div className="p-4 pb-32 max-w-xl">
      <h1 className="text-xl font-bold mb-4">Today's Sales</h1>

      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setViewMode("todaySales")}
          className={`px-3 py-1 rounded ${viewMode === "todaySales" ? "bg-blue-600 text-white" : "bg-gray-200"}`} >
          Daily Sales
        </button>
        <button
          onClick={() => setViewMode("productSummary")}
          className={`px-3 py-1 rounded ${viewMode === "productSummary" ? "bg-blue-600 text-white" : "bg-gray-200"}`} >
          Daily Summaries by Product
        </button>
        <button
          onClick={() => setViewMode("weekly")}
          className={`px-3 py-1 rounded ${viewMode === "weekly" ? "bg-blue-600 text-white" : "bg-gray-200"}`} >
          Weekly
        </button>
        <button
          onClick={() => setViewMode("monthly")}
          className={`px-3 py-1 rounded ${viewMode === "monthly" ? "bg-blue-600 text-white" : "bg-gray-200"}`} >
          Monthly
        </button>
      </div>

      {viewMode === "todaySales" && (
        <div>
          <div className="space-y-2">
            Date: <input className="bg-red-500" type="date" name="datePick" id="datePick" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); loadSales(e.target.value); }} />
            <div className="mb-6">
              <div>No. of Items Sold: {summary.totalSales}</div>
              <div>Total Revenue: KES {summary.totalRevenue}</div>
              <div>Total Due Sales: KES {summary.totalCreditSales}</div>
              <div>Total Profit: KES {summary.totalProfit}</div>
            </div>

            <div>
              <button
                onClick={() => setShowCreditList(prev => !prev)}
                className="px-3 py-1 rounded bg-yellow-400 text-black"
              >
                {showCreditList ? "Hide" : "Show"} Credit Sales
              </button>
            </div>

            <SaleList
              sales={sales}
              showCreditList={showCreditList}
              setShowCreditList={setShowCreditList}
              selectedSales={selectedSales}
              toggleSaleSelection={toggleSaleSelection}
              isSelected={isSelected}
              handleEditSale={handleEditSale}
              handleDeleteSale={handleDeleteSale}
              handleDeleteSaleWithStockRestore={handleDeleteSaleWithStockRestore}
            />

            <EditSaleModal
              editingSale={editingSale}
              handleEditChange={handleEditChange}
              handleSaveEdit={handleSaveEdit}
              handleCancelEdit={handleCancelEdit}
            />
          </div>
        </div>
      )}

      {viewMode === "productSummary" && (
        <ProductSummary productSummaries={productSummaries} allSales={allSales} />
      )}

      {/* All Date Summaries tab removed — not needed anymore */}

      {viewMode === "weekly" && (
        <WeeklySummary allSales={allSales} selectedDate={selectedDate} />
      )}

      {viewMode === "monthly" && (
        <MonthlySummary allSales={allSales} selectedDate={selectedDate} />
      )}
    </div>
  )
}
