import React from "react";
import { generateReceipt } from "../utils/generateReceipt";

function groupSales(sales) {
  const reversed = [...sales].reverse();
  const result = [];
  const bulkMap = {};

  reversed.forEach(sale => {
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

function BulkSaleGroup({ group, handleEditSale, handleDeleteSale, handleDeleteSaleWithStockRestore, selectedSales, toggleSaleSelection, isSelected }) {
  const totalAmount = group.items.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = group.items.reduce((sum, s) => sum + s.profit, 0);
  const totalQty = group.items.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="border-2 border-purple-400 rounded p-3 bg-purple-50">
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">BULK SALE</span>
          <span className="text-sm text-gray-500">
            {new Date(group.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </div>
        <div className="text-sm font-bold text-purple-700">KES {totalAmount} | Profit: {totalProfit}</div>
      </div>

      <div className="space-y-1">
        {group.items.map((sale, idx) => (
          <div key={idx} className="bg-white rounded p-2 flex justify-between items-center">
            <div>
              <span className="font-medium text-sm">{sale.quantity} × {sale.name}</span>
              <span className="text-xs text-gray-500 ml-2">@ KES {sale.sellingPrice} = KES {sale.total}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => handleEditSale(sale)} className="text-green-600">Edit</button>
              <button onClick={() => handleDeleteSale(sale)} className="text-red-600">Delete</button>
              <button onClick={() => handleDeleteSaleWithStockRestore(sale)} className="text-blue-600">Del+Stock</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs text-gray-500">{group.items.length} items — {totalQty} units total</div>

      <button
        onClick={() => generateReceipt(group.items)}
        className="mt-2 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
      >
        Receipt
      </button>
    </div>
  );
}

export default function SaleList({
  sales = [],
  showCreditList,
  setShowCreditList,
  selectedSales,
  toggleSaleSelection,
  isSelected,
  handleEditSale,
  handleDeleteSale,
  handleDeleteSaleWithStockRestore,
}) {
  const grouped = groupSales(sales);

  return (
    <div className="flex flex-col gap-2 mt-2">
      {showCreditList && (
        <div className="mt-3 space-y-2 mb-4">
          <h3 className="font-semibold">Credit Sales (selected date)</h3>
          {sales.filter(s => s.isCreditSale).length === 0 && <div className="text-sm text-gray-600">No credit sales.</div>}
          {sales.filter(s => s.isCreditSale).map((sale, idx) => (
            <div key={`credit-${idx}`} className="max-w-xl px-3 pt-2 rounded flex justify-between border rounded bg-red-50">
              <div className="flex justify-between">
                <div>
                  {sale.quantity} x {sale.name}
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => handleEditSale(sale)} className="text-green-600 text-sm">Edit</button>
                    <button onClick={() => handleDeleteSaleWithStockRestore(sale)} className="text-blue-600 text-sm">Delete & Update Stock</button>
                    <div className="text-sm text-gray-600">Total: KES {sale.total} | Profit: KES {sale.profit}</div>
                  </div>
                </div>
              </div>
              <div className="text-sm">
                {sale.isCreditPaid
                  ? <span className="text-green-600 font-semibold">PAID</span>
                  : <span className="text-red-600 font-semibold">UNPAID</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSales.length > 0 && (
        <button
          onClick={() => generateReceipt(selectedSales)}
          className="bg-blue-600 text-white px-4 py-2 rounded mt-4"
        >
          Download Group Receipt ({selectedSales.length} items)
        </button>
      )}

      {grouped.map((entry, index) => {
        if (entry.isBulkGroup) {
          return (
            <BulkSaleGroup
              key={`bulk-${entry.bulkSaleId}`}
              group={entry}
              handleEditSale={handleEditSale}
              handleDeleteSale={handleDeleteSale}
              handleDeleteSaleWithStockRestore={handleDeleteSaleWithStockRestore}
              selectedSales={selectedSales}
              toggleSaleSelection={toggleSaleSelection}
              isSelected={isSelected}
            />
          );
        }

        const sale = entry;
        return (
          <div key={index} className="border p-3 rounded">
            <div className="flex justify-between items-center">
              <div className="flex flex-col justify-between">
                <div className="font-semibold">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={isSelected(sale) || false}
                    onChange={() => toggleSaleSelection(sale)}
                  />
                  {sale.quantity} {sale.name}
                  <span className="text-sm text-red-600 px-1">
                    {sale.isCreditSale ? "Credit Sale" : ""}
                  </span>
                  {sale.isCreditSale && sale.isCreditPaid && (
                    <span className="text-sm text-green-600 px-1"> (PAID)</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  Sold at
                  <span className="px-1">
                    {new Date(sale.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  for Ksh. {sale.total}{sale.isCreditSale ? sale.dwnPayment ? " with a down payment of " + sale.dwnPayment : " with no down payment" : ", a profit of " + (sale.total - sale.costPrice * sale.quantity) + " shillings"}
                </div>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => handleEditSale(sale)} className="text-green-600 text-sm">Edit</button>
                  <button onClick={() => handleDeleteSale(sale)} className="text-red-600 text-sm">Delete</button>
                  <button onClick={() => handleDeleteSaleWithStockRestore(sale)} className="text-blue-600 text-sm">Delete & Update Stock</button>
                </div>
              </div>
              <button
                onClick={() => generateReceipt([sale])}
                className="mt-1 ml-4 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Receipt
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
