import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
import { db } from "../db";

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

function BulkSaleGroup({
  group,
  handleEditSale,
  handleDeleteSale,
  handleDeleteSaleWithStockRestore,
  handleMarkBulkPaid,
  handleLoadSales,
  handleReceiptDownload,
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
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
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
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
              onClick={() => handleReceiptDownload(group.items)}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-xs"
            >
              Receipt
            </button>
          </div>
        </div>
      )}
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
  handleMarkBulkPaid,
  handleLoadSales,
}) {
  const grouped = useMemo(() => groupSales(sales), [sales]);
  const creditSales = useMemo(() => sales.filter((s) => s.isCreditSale), [sales]);
  const groupedCreditSales = useMemo(() => groupSales(creditSales), [creditSales]);

  const handleReceiptDownload = async (items) => {
    try {
      const { generateReceipt } = await import("../utils/generateReceipt");
      generateReceipt(items);
    } catch (err) {
      console.error("Failed to generate receipt", err);
      alert("Unable to generate receipt right now.");
    }
  };

  const getPaymentInfo = (sale) => {
    let bulkTotal;
    let bulkDwnPayment;
    let initialBulkDwn;
    let paymentHistory = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];

    if (sale.isBulkGroup) {
      const first = sale.items[0];
      paymentHistory = Array.isArray(first?.paymentHistory) ? first.paymentHistory : [];
      bulkTotal = sale.items.reduce((s, i) => s + (i.total || 0), 0);
      bulkDwnPayment = first?.bulkDwnPayment || first?.dwnPayment || 0;
      initialBulkDwn = first?.initialBulkDwnPayment;
    }

    const total = Number(bulkTotal || sale.total || 0);
    const rawDwn = Number(bulkDwnPayment || sale.dwnPayment || 0);
    const historyPaid = paymentHistory.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // Legacy fix: if initialDwnPayment is not explicitly stored, subtract historyPaid from rawDwn
    const initialDwn =
      (sale.isBulkGroup ? initialBulkDwn : sale.initialDwnPayment) !== undefined
        ? Number(sale.isBulkGroup ? initialBulkDwn : sale.initialDwnPayment)
        : Math.max(0, rawDwn - historyPaid);

    const paid = initialDwn + historyPaid;

    return {
      total,
      paid,
      dwnPayment: initialDwn,
      historyPaid,
      balance: Math.max(0, total - paid),
      paymentHistory,
    };
  };

  const handleAddPayment = async (sale, amount, method = "cash", note = "") => {
    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    const paymentInfo = getPaymentInfo(sale);

    if (paymentAmount > paymentInfo.balance) {
      alert(
        `Payment cannot exceed the outstanding balance of KES ${paymentInfo.balance.toLocaleString()}.`
      );
      return;
    }

    const now = new Date().toISOString();

    const paymentEntry = {
      amount: paymentAmount,
      date: now,
      recordedBy: "Staff",
      method,
      note: note || "Additional payment",
    };

    if (sale.isBulkGroup) {
      const firstItem = sale.items[0];
      const existingHistory = Array.isArray(firstItem?.paymentHistory)
        ? firstItem.paymentHistory
        : [];
      const newHistory = [...existingHistory, paymentEntry];
      const newHistoryPaid = newHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const initialDwn = paymentInfo.dwnPayment;
      const newTotalPaid = initialDwn + newHistoryPaid;
      const isPaid = newTotalPaid >= paymentInfo.total;

      for (const item of sale.items) {
        await db.put({
          ...item,
          dwnPayment: initialDwn,
          initialBulkDwnPayment: initialDwn,
          bulkDwnPayment: initialDwn,
          paymentHistory: newHistory,
          isCreditPaid: isPaid,
          updatedAt: now,
        });
      }
    } else {
      const existingHistory = Array.isArray(sale.paymentHistory)
        ? sale.paymentHistory
        : [];
      const newHistory = [...existingHistory, paymentEntry];
      const newHistoryPaid = newHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const initialDwn = paymentInfo.dwnPayment;
      const newTotalPaid = initialDwn + newHistoryPaid;
      const isPaid = newTotalPaid >= paymentInfo.total;

      await db.put({
        ...sale,
        dwnPayment: initialDwn,
        initialDwnPayment: initialDwn,
        paymentHistory: newHistory,
        isCreditPaid: isPaid,
        updatedAt: now,
      });
    }

    try {
      handleLoadSales();
    } catch (error) {
      console.error("Failed to record payment:", error);
      alert("Failed to record payment.");
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      {showCreditList && (
        <div className="mt-3 space-y-2 mb-4">
          <h3 className="font-semibold">Credit Sales (selected date)</h3>
          {creditSales.length === 0 && (
            <div className="text-sm text-gray-600">No credit sales.</div>
          )}
          {groupedCreditSales.map((entry, idx) => {
            if (entry.isBulkGroup) {
              const bulkTotal = entry.items.reduce((s, i) => s + (i.total || 0), 0);
              const isPaid = entry.items[0]?.isCreditPaid || false;
              const payment = getPaymentInfo(entry);
              return (
                <div
                  key={`credit-bulk-${entry.bulkSaleId}`}
                  className="max-w-xl px-3 pt-3 pb-2 rounded border bg-red-50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div>
                          <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 mr-2 rounded">
                            BULK CREDIT
                          </span>
                          <span className="font-semibold">
                            {entry.items[0]?.customerName || (
                              <span className="italic text-gray-400">No name</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-end gap-2 ml-2 flex-shrink-0">
                          {isPaid ? (
                            <span className="text-green-600 font-semibold text-sm">PAID</span>
                          ) : (
                            <>
                              <span className="text-red-600 font-semibold text-sm">UNPAID</span>
                              <button
                                onClick={() => {
                                  handleMarkBulkPaid(entry.items);
                                }}
                                className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {entry.items.map((s, i) => (
                        <div key={i} className="text-sm text-gray-700">
                          {s.quantity} × {s.name} — KES {formatWhole(s.total)}
                        </div>
                      ))}

                      {/* Payment History Breakdown */}
                      <div className="border-t mt-2 pt-2 pb-2">
                        <div className="text-sm font-semibold mb-2">Payment History</div>
                        <div className="space-y-1">
                          <div className="text-xs flex items-center justify-between gap-2">
                            <span>
                              Down Payment on {new Date(entry.timestamp).toLocaleDateString()}
                            </span>
                            <span className="font-semibold text-green-600">
                              KES {Number(payment.dwnPayment || 0).toLocaleString()}
                            </span>
                          </div>

                          {payment.paymentHistory.map((hEntry, index) => (
                            <div
                              key={`${entry.bulkSaleId}-payment-${index}`}
                              className="text-xs flex items-center justify-between gap-2"
                            >
                              <span>
                                Additional Payment on{" "}
                                {new Date(hEntry.date).toLocaleDateString()}{" "}
                                {hEntry.method ? `(${hEntry.method})` : ""}
                              </span>
                              <span className="font-semibold text-green-600">
                                KES {Number(hEntry.amount || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>

                        {payment.balance > 0 && (
                          <div className="border-t py-1 mt-2 pt-2">
                            <div className="flex justify-center gap-2">
                              <input
                                type="number"
                                min="1"
                                max={payment.balance}
                                placeholder={`Add payment (max KES ${payment.balance})`}
                                className="border rounded p-1 flex-1 text-sm"
                                id={`payment-${entry.bulkSaleId}`}
                              />
                              <button
                                onClick={() => {
                                  const input = document.getElementById(
                                    `payment-${entry.bulkSaleId}`
                                  );
                                  const amount = Number(input?.value || 0);
                                  handleAddPayment(
                                    entry,
                                    amount,
                                    "cash",
                                    "Additional payment"
                                  );
                                  if (input) input.value = "";
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-semibold text-xs whitespace-nowrap"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between gap-3 mt-2 pt-2 border-t text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Total</div>
                            <div className="font-semibold">KES {payment.total}</div>
                          </div>

                          <div>
                            <div className="text-xs text-gray-500">Paid</div>
                            <div className="font-semibold text-green-600">
                              KES {payment.paid}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-gray-500">Balance</div>
                            <div
                              className={`font-semibold ${
                                payment.balance > 0 ? "text-red-600" : "text-green-600"
                              }`}
                            >
                              KES {payment.balance}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const sale = entry;
            const payment = getPaymentInfo(sale);
            return (
              <div
                key={`credit-${idx}`}
                className="max-w-xl px-3 pt-2 pb-2 rounded border bg-red-50"
              >
                <div className="col-span-3">
                  {sale.customerName && (
                    <div className="text-sm text-yellow-700 font-medium">
                      Customer: {sale.customerName}
                    </div>
                  )}
                  <div className="font-medium">
                    {sale.quantity} × {sale.name}
                  </div>

                  {/* Payment Breakdown */}
                  <div className="border-t mt-2 pt-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Total</div>
                        <div className="font-semibold">KES {payment.total}</div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">Paid</div>
                        <div className="font-semibold text-green-600">
                          KES {payment.paid}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">Balance</div>
                        <div
                          className={`font-semibold ${
                            payment.balance > 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          KES {payment.balance}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 border-t pt-2">
                      <div className="text-sm font-semibold mb-1">Payment History</div>
                      <div className="space-y-1">
                        <div className="text-xs flex items-center justify-between gap-2">
                          <span>
                            Down Payment on {new Date(sale.timestamp).toLocaleDateString()}
                          </span>
                          <span className="font-semibold text-green-600">
                            KES {Number(payment.dwnPayment || 0).toLocaleString()}
                          </span>
                        </div>

                        {payment.paymentHistory.map((hEntry, index) => (
                          <div
                            key={`${sale._id}-payment-${index}`}
                            className="text-xs flex items-center justify-between gap-2"
                          >
                            <span>
                              Additional Payment on{" "}
                              {new Date(hEntry.date).toLocaleDateString()}{" "}
                              {hEntry.method ? `(${hEntry.method})` : ""}
                            </span>
                            <span className="font-semibold text-green-600">
                              KES {Number(hEntry.amount || 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {payment.balance > 0 && (
                      <div className="my-2 border-t pt-2">
                        <div className="flex justify-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max={payment.balance}
                            placeholder={`Add payment (max KES ${payment.balance})`}
                            className="border rounded p-1 flex-1 text-sm"
                            id={`payment-${sale._id}`}
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(
                                `payment-${sale._id}`
                              );
                              const amount = Number(input?.value || 0);
                              handleAddPayment(
                                sale,
                                amount,
                                "cash",
                                "Additional payment"
                              );
                              if (input) input.value = "";
                            }}
                            className="bg-green-600 hover:bg-green-700 h-8 text-white px-3 py-1 rounded text-xs font-semibold whitespace-nowrap"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-500 my-2">
                      Payment status:{" "}
                      <span className="font-medium">
                        {payment.balance <= 0 ? (
                          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            PAID
                          </span>
                        ) : payment.paid > 0 ? (
                          <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            PARTIALLY PAID
                          </span>
                        ) : (
                          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            UNPAID
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <hr />
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={() => handleEditSale(sale)}
                      className="text-green-600 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSaleWithStockRestore(sale)}
                      className="text-blue-600 text-sm"
                    >
                      Delete & Update Stock
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSales.length > 0 && (
        <button
          onClick={() => handleReceiptDownload(selectedSales)}
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
              handleMarkBulkPaid={handleMarkBulkPaid}
              handleReceiptDownload={handleReceiptDownload}
              handleLoadSales={handleLoadSales}
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
                    {new Date(sale.timestamp).toLocaleString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  for Ksh. {formatWhole(sale.total)}
                  {sale.isCreditSale
                    ? sale.dwnPayment
                      ? " with a down payment of " + formatWhole(sale.dwnPayment)
                      : " with no down payment"
                    : ", a profit of " +
                      formatWhole(sale.total - sale.costPrice * sale.quantity) +
                      " shillings"}
                </div>
                {sale.isCreditSale && sale.customerName && (
                  <div className="text-sm text-yellow-700 font-medium mt-0.5">
                    Customer: {sale.customerName}
                  </div>
                )}
                <div className="flex gap-3 mt-1">
                  <button onClick={() => handleEditSale(sale)} className="text-green-600 text-sm">
                    Edit
                  </button>
                  <button onClick={() => handleDeleteSale(sale)} className="text-red-600 text-sm">
                    Delete
                  </button>
                  <button
                    onClick={() => handleDeleteSaleWithStockRestore(sale)}
                    className="text-blue-600 text-sm"
                  >
                    Delete & Update Stock
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleReceiptDownload([sale])}
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
