import React, { useState, useMemo } from "react";

function buildProductHistory(allSales, productName) {
  const relevant = allSales.filter(s => s.name === productName);
  const byDate = {};

  relevant.forEach(sale => {
    const dateKey = new Date(sale.timestamp).toLocaleDateString();
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(sale);
  });

  return Object.entries(byDate)
    .map(([date, sales]) => {
      const totalQty = sales.reduce((s, x) => s + x.quantity, 0);
      const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
      const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
      return { date, sales: sales.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)), totalQty, totalRevenue, totalProfit };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function ProductHistoryPanel({ productName, allSales, onClose }) {
  const history = useMemo(() => buildProductHistory(allSales, productName), [allSales, productName]);
  const grandQty = history.reduce((s, d) => s + d.totalQty, 0);
  const grandRevenue = history.reduce((s, d) => s + d.totalRevenue, 0);
  const grandProfit = history.reduce((s, d) => s + d.totalProfit, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 pt-10 px-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-lg font-bold">{productName}</h2>
            <p className="text-sm text-gray-500">All-time: {grandQty} units · KES {grandRevenue} revenue · KES {grandProfit} profit</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl font-bold px-2">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {history.length === 0 && (
            <p className="text-gray-500 text-sm">No sales recorded for this product.</p>
          )}
          {history.map(({ date, sales, totalQty, totalRevenue, totalProfit }) => (
            <div key={date}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-gray-700">{date}</span>
                <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">
                  {totalQty} units · KES {totalRevenue} · profit {totalProfit}
                </span>
              </div>
              <div className="space-y-1 pl-2 border-l-2 border-gray-200">
                {sales.map((sale, idx) => {
                  const time = new Date(sale.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const tags = [];
                  if (sale.isBulkSale) tags.push({ label: "BULK", color: "bg-purple-100 text-purple-700" });
                  if (sale.isCreditSale) tags.push({ label: "CREDIT", color: "bg-red-100 text-red-700" });
                  const amountOwed = sale.isCreditSale ? sale.total - (sale.bulkDwnPayment || sale.dwnPayment || 0) : 0;

                  return (
                    <div key={idx} className="flex justify-between items-start py-1 text-sm">
                      <div>
                        <span className="text-gray-400 text-xs mr-2">{time}</span>
                        <span className="font-medium">{sale.quantity} × KES {sale.sellingPrice}</span>
                        {tags.map((t, ti) => (
                          <span key={ti} className={`ml-1 text-xs px-1.5 py-0.5 rounded font-medium ${t.color}`}>{t.label}</span>
                        ))}
                        {sale.isCreditSale && sale.customerName && (
                          <span className="ml-1 text-xs text-yellow-700">({sale.customerName})</span>
                        )}
                        {sale.isCreditSale && !sale.isCreditPaid && (
                          <span className="ml-1 text-xs text-red-500">owes KES {amountOwed}</span>
                        )}
                        {sale.isCreditSale && sale.isCreditPaid && (
                          <span className="ml-1 text-xs text-green-600">paid</span>
                        )}
                      </div>
                      <span className="text-gray-700 font-semibold ml-2 flex-shrink-0">KES {sale.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductSummary({ productSummaries = {}, allSales = [] }) {
  const [selectedProduct, setSelectedProduct] = useState(null);

  return (
    <>
      <h2 className="text-lg font-semibold mb-2 mt-4">Sales Summary by Product</h2>
      <p className="text-xs text-gray-400 mb-3">Click a product to see its full sales history.</p>
      <div className="space-y-3">
        {Object.entries(productSummaries).length === 0 && (
          <div className="text-sm text-gray-600">No product summary available.</div>
        )}
        {Object.entries(productSummaries).map(([name, s], i) => (
          <button
            key={i}
            onClick={() => setSelectedProduct(name)}
            className="w-full text-left border p-3 rounded bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            <div className="flex justify-between items-center">
              <strong className="text-blue-700">{name}</strong>
              <span className="text-xs text-gray-400">View history →</span>
            </div>
            <div className="text-sm text-gray-600 mt-1 flex gap-4">
              <span>Sold: {s.quantity}</span>
              <span>Revenue: KES {s.revenue}</span>
              <span>Profit: KES {s.profit}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedProduct && (
        <ProductHistoryPanel
          productName={selectedProduct}
          allSales={allSales}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}
