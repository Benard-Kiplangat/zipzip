import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
import { db } from "../../../../nursery-management-system/src/db";

function groupSales(sales) {
  const ordered = [...sales];
  const result = [];
  const bulkMap = {};

  ordered.forEach(sale => {
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
  const totalAmount = group.items.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalProfit = group.items.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalQty = group.items.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const isCreditSale = group.items[0]?.isCreditSale || false;
  const customerName = group.items[0]?.customerName || "";
  const bulkDwnPayment = group.items[0]?.bulkDwnPayment || 0;
  const amountOwed = totalAmount - bulkDwnPayment;
  const isPaid = group.items[0]?.isCreditPaid || false;

  const borderClass = isCreditSale ? "border-red-400 bg-red-50" : "border-purple-400 bg-purple-50";
  const badgeBg = isCreditSale ? "bg-red-600" : "bg-purple-600";

  return (
    <div className={`border-2 ${borderClass} rounded p-3`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${badgeBg} text-white text-xs font-bold px-2 py-0.5 rounded`}>
            {isCreditSale ? "BULK CREDIT" : "BULK SALE"}
          </span>
          <span className="text-sm text-gray-500">
            {new Date(group.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          {isCreditSale && customerName && (
            <span className="text-sm font-semibold text-yellow-700">{customerName}</span>
          )}
        </div>
        <div className="text-sm font-bold text-right">
          <div>KES {formatWhole(totalAmount)}</div>
          {canViewProfit && (
            <div className="text-gray-500 text-xs">Profit: {formatWhole(totalProfit)}</div>
          )}
        </div>
      </div>

      {isCreditSale && (
        <div className="mb-2 text-sm bg-white rounded p-2 border border-red-200 flex justify-between items-center gap-2">
          <div>
            {isPaid
              ? <span className="text-green-600 font-bold">PAID</span>
              : bulkDwnPayment > 0
                ? <><span className="text-gray-600">Down: KES {formatWhole(bulkDwnPayment)} | </span><span className="text-red-600 font-medium">Owes: KES {formatWhole(amountOwed)}</span></>
                : <span className="text-red-600 font-medium">Owes full: KES {formatWhole(totalAmount)} (no down payment)</span>
            }
          </div>
          {isCreditSale && !isPaid && (
            <button
              onClick={() => handleMarkBulkPaid(group.items)}
              className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 whitespace-nowrap flex-shrink-0"
            >
              Mark All Paid
            </button>
          )}
        </div>
      )}

      <div className="space-y-1">
        {group.items.map((sale, idx) => (
          <div key={idx} className="bg-white rounded p-2 flex justify-between items-center">
            <div>
              <span className="font-medium text-sm">{sale.quantity} × {sale.name}</span>
              <span className="text-xs text-gray-500 ml-2">@ KES {formatWhole(sale.sellingPrice)} = KES {formatWhole(sale.total)}</span>
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
        onClick={() => handleReceiptDownload(group.items)}
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
  handleMarkBulkPaid,
  handleLoadSales
}) {
  const grouped = useMemo(() => groupSales(sales), [sales]);
  const creditSales = useMemo(() => sales.filter(s => s.isCreditSale), [sales]);
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

  const getPaymentInfo = sale => {
    let bulkTotal;
    let bulkDwnPayment;
    let amountOwed;


        let paymentHistory = Array.isArray(sale.paymentHistory)
      ? sale.paymentHistory
      : [];

    if (sale.isBulkGroup) {
       paymentHistory = Array.isArray(sale.items[0]?.paymentHistory)
      ? sale.items[0]?.paymentHistory
      : [];
              bulkTotal = sale.items.reduce((s, i) => s + (i.total || 0), 0);
              bulkDwnPayment = sale.items[0]?.bulkDwnPayment || 0;
              amountOwed = bulkTotal - bulkDwnPayment;
    }
    const total = Number(bulkTotal || sale.total || 0);
    const dwnPayment = Number(bulkDwnPayment || sale.dwnPayment || 0)

    const paid = paymentHistory.length > 0
      ? (paymentHistory.reduce(
        (sum, payment) =>
          sum + Number(payment.amount || 0),
        0
      ) + dwnPayment)
      : Number(bulkDwnPayment || sale.dwnPayment || 0);

    return {
      total,
      paid,
      dwnPayment,
      balance: Math.max(0, total - paid),
      paymentHistory,
    };
  };

  const handleAddPayment = async (
    sale,
    amount,
    method = "cash",
    note = ""
  ) => {
    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    const paymentInfo = getPaymentInfo(sale);

    if (paymentAmount > paymentInfo.balance) {
      alert(
        `Payment cannot exceed the outstanding balance of KES ${paymentInfo.balance}.`
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

    let existingHistory = Array.isArray(sale.paymentHistory)
      ? sale.paymentHistory
      : [];

    const newPaidAmount =
      paymentInfo.paid + paymentAmount;
let updatedSale = {
      ...sale,
      bulkSaleId: sale.bulkSaleId,
      paymentHistory: [
        ...existingHistory,
        paymentEntry,
      ],
      dwnPayment: newPaidAmount,
      isCreditPaid:
        newPaidAmount >= paymentInfo.total,
      updatedAt: now,
    };

    if (sale.isBulkGroup) {
      existingHistory = Array.isArray(sale.items[0].paymentHistory)
      ? sale.items[0].paymentHistory
      : [];

      updatedSale = {
      ...sale.items[0],
      bulkSaleId: sale.bulkSaleId,
      paymentHistory: [
        ...existingHistory,
        paymentEntry,
      ],
      dwnPayment: newPaidAmount,
      isCreditPaid:
        newPaidAmount >= paymentInfo.total,
      updatedAt: now,
    };
  }
    try {
      await db.put(updatedSale);
      alert("Additional payment is being recorded.")
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
          {creditSales.length === 0 && <div className="text-sm text-gray-600">No credit sales.</div>}
          {groupedCreditSales.map((entry, idx) => {
            if (entry.isBulkGroup) {
              const bulkTotal = entry.items.reduce((s, i) => s + (i.total || 0), 0);
              const bulkDwnPayment = entry.items[0]?.bulkDwnPayment || 0;
              const amountOwed = bulkTotal - bulkDwnPayment;
              const isPaid = entry.items[0]?.isCreditPaid || false;
              const payment = getPaymentInfo(entry);
              return (
                <div key={`credit-bulk-${entry.bulkSaleId}`} className="max-w-xl px-3 pt-3 pb-2 rounded border bg-red-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                      <div>
                        <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 mr-2 rounded">BULK CREDIT</span>
                        <span className="font-semibold">{entry.items[0]?.customerName || <span className="italic text-gray-400">No name</span>}</span>
                        </div>
                        <div className="flex items-end gap-2 ml-2 flex-shrink-0">
                      {isPaid
                        ? <span className="text-green-600 font-semibold text-sm">PAID</span>
                        : <>
                          <span className="text-red-600 font-semibold text-sm">UNPAID</span>
                          <button
                            onClick={() => {handleMarkBulkPaid(entry.items)}}
                            className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                          >
                            Mark Paid
                          </button>
                        </>
                      }
                    </div>
                      </div>
                      {entry.items.map((s, i) => (
                        <div key={i} className="text-sm text-gray-700">{s.quantity} × {s.name} — KES {formatWhole(s.total)}</div>
                      ))}
                      {/* Payment */}
                      <div className="border-t mt-1 pt-1 pb-2">
                          <div className="">
                            <div className="text-sm font-semibold mb-2">
                              Payment History
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs flex items-center justify-between gap-2"
                                >
                                  <span>
                                    
                                    {"Down Payment"}
                                    
                                    {" on "}
                                    
                                    {new Date(entry.timestamp).toLocaleDateString()}

                                    {" "}
                                  </span>

                                  <span className="font-semibold text-green-600">
                                    KES {Number(payment.dwnPayment || 0).toLocaleString()}
                                  </span>
                                </div>
                              {payment.paymentHistory.map((entry, index) => (
                                <div
                                  key={`${entry.bulkSaleId}-payment-${index}`}
                                  className="text-xs flex items-center justify-between gap-2"
                                >
                                  <span>
                                    
                                    {"Additional Payment"}
                                    
                                    {" on "}

                                    {" "}
                                    {new Date(entry.date).toLocaleDateString()}
                                    {" "}

                                  </span>

                                  <span className="font-semibold text-green-600">
                                    KES {Number(entry.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                        {(payment.balance) > 0 && (
                          <div className="border-t py-1 mt-1 pt-2">
                            <div className="flex justify-center gap-2">
                              <input
                                type="number"
                                min="1"
                                max={payment.balance}
                                placeholder={`Add payment (max ksh. ${payment.balance})`}
                                className="border rounded p-1 flex-1"
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

                                  if (input) {
                                    input.value = "";
                                  }
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-semibold"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between gap-3 mt-1 pt-3 border-t text-sm">
                      <div>
                        <div className="text-xs text-gray-500">
                          Total
                        </div>
                        <div className="font-semibold">
                          KES {payment.total}
                        </div>
                      </div>

                      <div>
                        <div>
                          <div className="text-xs text-gray-500">
                            Paid
                          </div>
                          <div className="font-semibold text-green-600">
                            KES {payment.paid}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">
                          Balance
                        </div>
                        <div
                          className={`font-semibold ${payment.balance > 0
                              ? "text-red-600"
                              : "text-green-600"
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
              <div key={`credit-${idx}`} className="max-w-xl px-8 pt-2 pb-2 rounded border bg-red-50">
                <div className="col-span-3">
                  {sale.customerName && (
                    <div className="text-sm text-yellow-700 font-medium">Customer: {sale.customerName}</div>
                  )}
                  <div className="font-medium">{sale.quantity} × {sale.name}</div>
                  {/* Payment */}
                  <div className="border-t mt-2 pt-3">
                    <div className="flex justify-between gap-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">
                          Total
                        </div>
                        <div className="font-semibold">
                          KES {payment.total}
                        </div>
                      </div>

                      <div>
                        <div>
                          <div className="text-xs text-gray-500">
                            Paid
                          </div>
                          <div className="font-semibold text-green-600">
                            KES {payment.paid}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">
                          Balance
                        </div>
                        <div
                          className={`font-semibold ${payment.balance > 0
                              ? "text-red-600"
                              : "text-green-600"
                            }`}
                        >
                          KES {payment.balance}
                        </div>
                      </div>
                    </div>

                    {payment.paymentHistory.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <div className="text-sm font-semibold mb-2">
                          Payment History
                        </div>

                        <div className="space-y-1">
                          {payment.paymentHistory.map((entry, index) => (
                            <div
                              key={`${sale._id}-payment-${index}`}
                              className="text-xs flex items-center justify-between gap-2"
                            >
                              <span>
                                [
                                {" "}
                                {new Date(entry.date).toLocaleDateString()}
                                {" · "}
                                {entry.method || "cash"}
                                {" "}
                                ]
                              </span>

                              <span className="font-semibold text-green-600">
                                KES {Number(entry.amount || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {payment.balance > 0 && (
                      <div className="my-2 border-t pt-3">
                        <div className="flex justify-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max={payment.balance}
                            placeholder={`Add payment (max ksh. ${payment.balance})`}
                            className="border rounded p-1 flex-1"
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

                              if (input) {
                                input.value = "";
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 h-8 text-white px-3 py-1 rounded"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-gray-500 my-3">
                      Payment status:{" "}
                      <span className="font-medium">
                        {payment.balance <= 0 ? (
                          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">
                            PAID
                          </span>
                        ) : payment.paid > 0 ? (
                          <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                            PARTIALLY PAID
                          </span>
                        ) : (
                          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">
                            UNPAID
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <hr />
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => handleEditSale(sale)} className="text-green-600 text-sm">Edit</button>
                    <button onClick={() => handleDeleteSaleWithStockRestore(sale)} className="text-blue-600 text-sm">Delete & Update Stock</button>
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
                    {new Date(sale.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  for Ksh. {formatWhole(sale.total)}{sale.isCreditSale ? sale.dwnPayment ? " with a down payment of " + formatWhole(sale.dwnPayment) : " with no down payment" : ", a profit of " + formatWhole(sale.total - sale.costPrice * sale.quantity) + " shillings"}
                </div>
                {sale.isCreditSale && sale.customerName && (
                  <div className="text-sm text-yellow-700 font-medium mt-0.5">
                    Customer: {sale.customerName}
                  </div>
                )}
                <div className="flex gap-3 mt-1">
                  <button onClick={() => handleEditSale(sale)} className="text-green-600 text-sm">Edit</button>
                  <button onClick={() => handleDeleteSale(sale)} className="text-red-600 text-sm">Delete</button>
                  <button onClick={() => handleDeleteSaleWithStockRestore(sale)} className="text-blue-600 text-sm">Delete & Update Stock</button>
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
