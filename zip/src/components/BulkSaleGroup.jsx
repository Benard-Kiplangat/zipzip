import React from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

export default function BulkSaleGroup({
  group,
  handleEditSale,
  handleDeleteSale,
  handleDeleteSaleWithStockRestore,
  handleMarkBulkPaid,
  onReceiptClick,
  receiptDisabled,
  isGeneratingReceipt,
}) {
  const { canViewProfit } = useAuth();
  const [expanded, setExpanded] = React.useState(false);

  const totalAmount = group.items.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalProfit = group.items.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalQty = group.items.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const isCreditSale = group.items[0]?.isCreditSale || false;
  const customerName = group.items[0]?.customerName || "";
  const bulkDwnPayment = group.items[0]?.bulkDwnPayment || 0;
  const amountOwed = totalAmount - bulkDwnPayment;
  const isPaid = group.items[0]?.isCreditPaid || false;

  const borderClass = isCreditSale
    ? "border-l-4 border-red-400 bg-red-50"
    : "border-l-4 border-purple-400 bg-purple-50";
  const badgeBg = isCreditSale ? "bg-red-600" : "bg-purple-600";

  return (
    <div className={`rounded ${borderClass} px-3 py-2`}>
      {/* Compact header row — always visible */}
      <div className="flex items-center justify-between gap-2 oveflow-x-auto">
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          <span className={`${badgeBg} text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>
            {isCreditSale ? "BULK CREDIT" : "BULK SALE"}
          </span>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {new Date(group.timestamp).toLocaleString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
          {customerName && (
            <span className="text-xs font-semibold text-yellow-700 truncate">{customerName}</span>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            ({group.items.length} items · {totalQty} units)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold">KES {formatWhole(totalAmount)}</div>
            {canViewProfit && (
              <div className="text-[10px] text-gray-500">Profit: {formatWhole(totalProfit)}</div>
            )}
          </div>
          {isCreditSale && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                isPaid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {isPaid ? "PAID" : "UNPAID"}
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 bg-white transition-colors"
          >
            {expanded ? "▲ Hide" : "▼ Show"}
          </button>
        </div>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1 min-w-[350px]">
          {group.items.map((sale, idx) => (
            <div
              key={idx}
              className="bg-white rounded p-1.5 flex justify-between items-center text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{sale.quantity} × {sale.name}</span>
                <span className="text-gray-400 ml-1">= KES {formatWhole(sale.total)}</span>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-2">
                <button onClick={() => handleEditSale(sale)} className="text-green-600">Edit</button>
                <button onClick={() => handleDeleteSale(sale)} className="text-red-600">Delete</button>
                <button
                  onClick={() => handleDeleteSaleWithStockRestore(sale)}
                  className="text-blue-600"
                >
                  Delete & restock
                </button>
              </div>
            </div>
          ))}

          {/* Credit summary & mark paid */}
          {isCreditSale && !isPaid && (
            <div className="flex items-center justify-between pt-1 gap-2">
              <span className="text-xs text-gray-500">
                {bulkDwnPayment > 0
                  ? `Down: KES ${formatWhole(bulkDwnPayment)} | Owes: KES ${formatWhole(amountOwed)}`
                  : `Owes full: KES ${formatWhole(totalAmount)}`}
              </span>
              <button
                onClick={() => handleMarkBulkPaid(group.items)}
                className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 whitespace-nowrap flex-shrink-0"
              >
                Mark Paid
              </button>
            </div>
          )}

          <div className="pt-1">
            <button
        onClick={() => onReceiptClick(group.items, `bulk-${group.bulkSaleId}`)}
        disabled={receiptDisabled}
        className="mt-2 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
      >
        {isGeneratingReceipt ? "Generating receipt..." : "Receipt"}
      </button>
          </div>
        </div>
      )}
    </div>
  );
}