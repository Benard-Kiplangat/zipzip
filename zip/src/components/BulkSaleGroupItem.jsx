import React from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";

export default function BulkSaleGroupItem({
  group,
  handleEditSale,
  handleDeleteSale,
  handleDeleteSaleWithStockRestore,
  handleMarkBulkPaid,
  handleReceiptDownload,
}) {
  const { canViewProfit } = useAuth();
  const totalAmount = group.items.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalProfit = group.items.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalQty = group.items.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const isCreditSale = group.items[0]?.isCreditSale || false;
  const customerName = group.items[0]?.customerName || "";
  const bulkDwnPayment = group.items[0]?.bulkDwnPayment || 0;
  const amountOwed = totalAmount - bulkDwnPayment;
  const isPaid = group.items[0]?.isCreditPaid || false;

  const borderClass = isCreditSale
    ? "border-amber-300 bg-amber-50/40"
    : "border-purple-200 bg-purple-50/40";
  const badgeBg = isCreditSale ? "bg-amber-600" : "bg-purple-600";

  return (
    <div className={`border-2 ${borderClass} rounded-2xl p-3.5 space-y-2.5 shadow-2xs`}>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${badgeBg} text-white text-[11px] font-bold px-2 py-0.5 rounded-full`}>
            {isCreditSale ? "BULK CREDIT" : "BULK SALE"}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {new Date(group.timestamp).toLocaleString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
          {isCreditSale && customerName && (
            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              Customer: {customerName}
            </span>
          )}
        </div>

        <div className="text-xs font-bold text-right">
          <div className="text-slate-900 text-sm">KES {formatWhole(totalAmount)}</div>
          {canViewProfit && (
            <div className="text-slate-500 text-[11px] font-medium">
              Profit: KES {formatWhole(totalProfit)}
            </div>
          )}
        </div>
      </div>

      {isCreditSale && (
        <div className="text-xs bg-white rounded-xl p-2.5 border border-amber-200 flex justify-between items-center gap-2">
          <div>
            {isPaid ? (
              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                ✓ FULLY PAID
              </span>
            ) : bulkDwnPayment > 0 ? (
              <>
                <span className="text-slate-600">Down Payment: KES {formatWhole(bulkDwnPayment)} | </span>
                <span className="text-rose-600 font-bold">Owes: KES {formatWhole(amountOwed)}</span>
              </>
            ) : (
              <span className="text-rose-600 font-bold">
                Owes full: KES {formatWhole(totalAmount)}
              </span>
            )}
          </div>
          {isCreditSale && !isPaid && (
            <button
              onClick={() => handleMarkBulkPaid(group.items)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap"
            >
              Mark All Paid
            </button>
          )}
        </div>
      )}

      {/* Item List */}
      <div className="space-y-1.5">
        {group.items.map((sale, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl p-2.5 border border-slate-100 flex justify-between items-center text-xs"
          >
            <div>
              <span className="font-bold text-slate-900">
                {sale.quantity} × {sale.name}
              </span>
              <span className="text-slate-500 ml-2">
                @ KES {formatWhole(sale.sellingPrice)} ={" "}
                <strong className="text-slate-800">KES {formatWhole(sale.total)}</strong>
              </span>
            </div>
            <div className="flex gap-2 text-[11px] font-semibold">
              <button
                onClick={() => handleEditSale(sale)}
                className="text-emerald-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteSale(sale)}
                className="text-rose-600 hover:underline"
              >
                Del
              </button>
              <button
                onClick={() => handleDeleteSaleWithStockRestore(sale)}
                className="text-blue-600 hover:underline"
              >
                Del+Stock
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-1">
        <span className="text-xs text-slate-500 font-medium">
          {group.items.length} item(s) — {totalQty} units total
        </span>
        <button
          onClick={() => handleReceiptDownload(group.items)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
        >
          📄 Receipt
        </button>
      </div>
    </div>
  );
}
