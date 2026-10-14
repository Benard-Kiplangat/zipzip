import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatWhole } from "../utils/format";
import { useBusinessConfig } from "../config";

export default function Cart({ cart, onUpdateQty, onUpdatePrice, onRemoveItem, onClearCart, onMakeSale, customers = [] }) {
  const { canViewProfit } = useAuth();
  const [isCredit, setIsCredit] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [dwnPayment, setDwnPayment] = useState(0);
  const [mpesaProcessing, setMpesaProcessing] = useState(false);
    const [mpesaStatus, setMpesaStatus] = useState(null);
    const [mpesaFailureReason, setMpesaFailureReason] = useState("");
    const [activeMpesaPayment, setActiveMpesaPayment] = useState(null);
    const [mpesaRefreshing, setMpesaRefreshing] = useState(false);
  
    // Payment
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [mpesaPayment, setMpesaPayment] = useState(null);
  
    // M-PESA modal
    const [showMpesaModal, setShowMpesaModal] = useState(false);
    const [mpesaDraft, setMpesaDraft] = useState({
      transactionId: "",
      phone: "",
      amount: "",
      mpesaSaleStatus: "idle"
    });

    const { config } = useBusinessConfig();

  const initiateMpesaPayment = async () => {
    const phone = mpesaDraft.phone.trim();
    const amount = Number(mpesaDraft.amount);

    if (!phone) {
      alert("Enter the customer's M-PESA number.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }

    try {
      setMpesaProcessing(true);
      setMpesaStatus("pending");
      setMpesaFailureReason("");

      let phoneNumber = "254708374149" // phone.replace(/\D/g, "");

      if (phoneNumber.startsWith("0")) {
        phoneNumber = "254" + phoneNumber.substring(1);
      }

      if (!phoneNumber.startsWith("254")) {
        throw new Error(
          "Enter a valid Kenyan M-PESA number."
        );
      }

      const response = await fetch(
        `https://yelivate-apis.onrender.com/api/mpesa/stkpush?business=${config.businessCode}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            phoneNumber,
            amount,
            accountReference: `SALE-${Date.now()}`,
            transactionDesc: config.transactionDescription
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
          data.errorMessage ||
          "Failed to initiate M-PESA payment."
        );
      }
      const checkoutRequestId =
        data.CheckoutRequestID ||
        data.checkoutRequestId;

      if (!checkoutRequestId) {
        throw new Error(
          "M-PESA did not return a CheckoutRequestID."
        );
      }

      setActiveMpesaPayment({
        checkoutRequestId,
        merchantRequestId:
          data.MerchantRequestID ||
          data.merchantRequestId ||
          null
      });

      setMpesaDraft(prev => ({
        ...prev,
        phone: phoneNumber,
        checkoutRequestId,
        merchantRequestId:
          data.MerchantRequestID ||
          data.merchantRequestId ||
          null,
        mpesaSaleStatus: "pending"
      }));

      console.log(
        "STK Push initiated:",
        checkoutRequestId
      );

      // Start checking the persistent payment status
      pollMpesaPayment(
        checkoutRequestId
      );

    } catch (error) {

      console.error(
        "M-PESA payment error:",
        error
      );

      setMpesaStatus("failed");
      setMpesaFailureReason(
        error?.message ||
        "Payment request was rejected or timed out. Please retry."
      );

      alert(
        error.message ||
        "Unable to initiate M-PESA payment."
      );

    } finally {
      setMpesaProcessing(false);
    }
  };

  const checkMpesaPaymentStatus = async (checkoutRequestId) => {
    try {
      const response = await fetch(
        `https://yelivate-apis.onrender.com/api/mpesa/status/${checkoutRequestId}?business=${config.businessCode}`,
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to check M-PESA status."
        );
      }

      const payment = data.payment;

      if (payment.status === "completed") {
        setMpesaStatus("success");

        setMpesaDraft(prev => ({
          ...prev,
          transactionId:
            payment.transactionId || prev.transactionId,
          checkoutRequestId:
            payment.checkoutRequestId,
          merchantRequestId:
            payment.merchantRequestId,
          mpesaSaleStatus:
            payment.status
        }));

        return "completed";
      }

      if (payment.status === "failed") {
        const failureReason =
          payment.resultDesc ||
          payment.resultDescription ||
          "Payment request was rejected or timed out. Please retry.";

        setMpesaStatus("failed");
        setMpesaFailureReason(failureReason);

        setMpesaDraft(prev => ({
          ...prev,
          mpesaSaleStatus:
            "failed"
        }));

        return "failed";
      }

      setMpesaDraft(prev => ({
        ...prev,
        mpesaSaleStatus:
          "pending"
      }));

      return "pending";

    } catch (error) {
      console.error(
        "M-PESA status check failed:",
        error
      );

      return "pending";
    }
  };

  const pollMpesaPayment = async (checkoutRequestId) => {
    const maxAttempts = 30;
    const interval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {

      const status =
        await checkMpesaPaymentStatus(
          checkoutRequestId
        );

      if (
        status === "completed" ||
        status === "failed"
      ) {
        return;
      }

      await new Promise(resolve =>
        setTimeout(resolve, interval)
      );
    }

    // We stopped waiting, but don't mark it failed.
    // The customer may still complete the payment.
    setMpesaStatus("timeout");

    console.log(
      "M-PESA polling timed out. Payment may still complete."
    );
  };

  const refreshMpesaStatus = async () => {
    const checkoutRequestId =
      activeMpesaPayment?.checkoutRequestId;

    if (
      !checkoutRequestId ||
      mpesaRefreshing
    ) {
      return;
    }

    try {
      setMpesaRefreshing(true);

      await checkMpesaPaymentStatus(
        checkoutRequestId
      );

    } catch (error) {

      console.error(
        "Manual M-PESA status refresh failed:",
        error
      );

    } finally {
      setMpesaRefreshing(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
  const cartProfit = cart.reduce((sum, item) => sum + item.qty * (item.sellingPrice - item.product.costPrice), 0);
  const amountOwed = cartTotal - dwnPayment;

   /*
   * Open M-PESA payment details modal.
   *
   * This does not create or modify a sale.
   * It only prepares the modal with the current
   * payment information.
   */
  const openMpesaModal = () => {
    const customerPhone =
      customers.find(
        c => c.name === customerName
      )?.phone || "";

    setMpesaDraft({
      transactionId:
        mpesaPayment?.transactionId || "",

      checkoutRequestId: mpesaPayment?.checkoutRequestId || "",

      merchantRequestId: mpesaPayment?.merchantRequestId || "",

      mpesaSaleStatus: mpesaPayment?.mpesaSaleStatus || "idle",

      phone:
        mpesaPayment?.phone ||
        customerPhone,

      amount:
        mpesaPayment?.amount ??
        cartTotal
    });

    setShowMpesaModal(true);
  };

  /*
   * Save M-PESA details to local React state only.
   *
   * IMPORTANT:
   * No db.put() here.
   * No sale is created here.
   * The parent handleCartSale() will receive
   * this information when the sale is completed.
   */
  const saveMpesaPayment = () => {
    const transactionId =
      mpesaDraft.transactionId
        .trim()
        .toUpperCase();

    const phone =
      mpesaDraft.phone.trim();

    const amount =
      Number(mpesaDraft.amount);

    const mpesaSaleStatus =
      mpesaDraft.mpesaSaleStatus

    if (!transactionId) {
      alert(
        "Please enter the M-PESA transaction ID."
      );
      return;
    }

    if (!amount || amount <= 0) {
      alert(
        "Please enter a valid M-PESA payment amount."
      );
      return;
    }

    if (amount > cartTotal) {
      alert(
        `M-PESA payment cannot exceed the sale total of Ksh ${cartTotal.toLocaleString()}.`
      );
      return;
    }

    setMpesaPayment({
      method: "mpesa",
      customerName,
      transactionId,
      phone,
      amount,
      mpesaSaleStatus,
    });

    setShowMpesaModal(false);
  };

  const handlePaymentMethodChange = (
    method
  ) => {
    setPaymentMethod(method);

    if (method === "cash") {
      setMpesaPayment(null);
      setShowMpesaModal(false);
    }
  };

  const handleSale = () => {
     if (
      paymentMethod === "mpesa" &&
      !mpesaPayment
    ) {
      alert(
        "Please enter the M-PESA payment details."
      );
      return;
    }
    onMakeSale({ isCreditSale: isCredit, customerName, dwnPayment: Number(dwnPayment), paymentMethod, mpesaPayment });
  };

  const handleClear = () => {
    setIsCredit(false);
    setCustomerName("");
    setDwnPayment(0);
    setPaymentMethod("cash");
    setMpesaPayment(null);

    setShowMpesaModal(false);
    setMpesaStatus(null);

    setMpesaDraft({
      phone: "",
      amount: "",
      transactionId: "",
      checkoutRequestId: "",
      merchantRequestId: "",
      mpesaSaleStatus: "idle"
    });
    onClearCart();
  };

  return (
    <div className="p-4 border rounded bg-gray-50 w-full flex flex-col gap-2 self-start">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Cart {cart.length > 0 && `(${cart.length})`}</h2>
        {cart.length > 0 && (
          <button onClick={handleClear} className="text-red-500 text-sm hover:text-red-700 font-medium">
            Clear All
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Cart is empty</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
            {cart.map(item => (
              <div key={item.product._id} className="border rounded p-1 bg-white">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm leading-tight">{item.product.name}</span>
                  <button
                    onClick={() => onRemoveItem(item.product._id)}
                    className="text-red-400 text-sm hover:text-red-600 ml-1 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  <label className="text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    min="1"
                    className="border p-0.75 w-12 rounded text-sm"
                      value={item.qty}
                      onChange={e => onUpdateQty(item.product._id, parseInt(e.target.value, 10) || 1)}
                  />
                  <label className="text-xs text-gray-500">@</label>
                  <input
                    type="number"
                    className="border p-0.75 w-16 rounded text-sm"
                    value={item.sellingPrice}
                    onChange={e => onUpdatePrice(item.product._id, parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="text-sm font-semibold">= {formatWhole(item.qty * item.sellingPrice)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {canViewProfit && (
                    <span>Profit: KES {formatWhole(item.qty * (item.sellingPrice - item.product.costPrice))} | </span>
                  )}
                  Stock: {item.product.stock}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-2 space-y-1">
            <div className="text-sm font-bold">Total: KES {formatWhole(cartTotal)}</div>
            {canViewProfit && (
              <div className="text-sm text-gray-600">Total Profit: KES {formatWhole(cartProfit)}</div>
            )}
          </div>

          <div className="border rounded p-2 bg-white space-y-2">

            {/* Payment method */}
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Payment Method
              </label>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() =>
                    handlePaymentMethodChange(
                      "cash"
                    )
                  }
                  className={`border rounded p-2 text-sm font-medium ${paymentMethod === "cash"
                    ? "bg-green-100 border-green-500 text-green-700"
                    : "bg-white text-slate-600"
                    }`}
                >
                  💵 Cash
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handlePaymentMethodChange(
                      "mpesa"
                    )
                  }
                  className={`border rounded p-2 text-sm font-medium ${paymentMethod === "mpesa"
                    ? "bg-green-100 border-green-500 text-green-700"
                    : "bg-white text-slate-600"
                    }`}
                >
                  📱 M-PESA
                </button>
              </div>
            </div>

            {/* Customer */}
            <div className="flex gap-2 w-full">
              <div className="space-y-2 pt-1 border-t">
                {customers.length > 5 && (
                  <input
                    type="search"
                    placeholder="Search customers..."
                    className="w-full border p-1.5 rounded text-sm"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                  />
                )}
                
                  {customers.length > 0 && (
                    <select
                      className="w-full border p-1.5 rounded text-sm"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                    >
                      <option value="">Select customer (or type below)</option>
                      {customers
                        .filter(c => customers.length <= 5 || c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                        .map(c => (
                          <option key={c._id} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                  )}

                <input
                  type="text"
                  placeholder="New customer name..."
                  className="w-full border p-1.5 rounded text-sm"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />

                { isCredit && (
                  <input
                  type="number"
                  placeholder="Down payment"
                  className="w-full border p-1.5 rounded text-sm"
                  value={dwnPayment}
                  min="0"
                  onChange={e => setDwnPayment(Number(e.target.value) || 0)}
                />
                )}

                {dwnPayment > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    Owes after payment: KES {formatWhole(Math.max(0, amountOwed))}
                  </div>
                )}
              </div>
            </div>

            {/* M-PESA payment */}
            {paymentMethod === "mpesa" && (
              <div className="border rounded-lg p-2 bg-slate-50">

                {mpesaPayment ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-green-700">
                        ✓ M-PESA payment entered
                      </div>

                      <div className="text-[11px] text-slate-500 truncate">
                        {mpesaPayment.transactionId}
                        {" • "}
                        Ksh{" "}
                        {Number(
                          mpesaPayment.amount
                        ).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={
                        openMpesaModal
                      }
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">
                      M-PESA payment details
                    </div>

                    <button
                      type="button"
                      onClick={
                        openMpesaModal
                      }
                      className="w-full bg-purple-500 hover:bg-purple-700 text-white rounded py-2 text-sm font-semibold"
                    >
                      Enter M-PESA Payment
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded p-2 bg-white space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isCredit}
                onChange={e => {
                  setIsCredit(e.target.checked);
                  if (!e.target.checked) { setDwnPayment(0); }
                }}
              />
              <span className="text-sm font-medium text-red-700">Credit Sale?</span>
            </label>         
          </div>

          <button
            onClick={handleSale}
            className={`text-white px-3 py-2 rounded font-semibold w-full ${isCredit ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {isCredit ? "Make Bulk Credit Sale" : "Make Bulk Sale"} ({cart.length} items)
          </button>
        </>
      )}
      
            {/* M-PESA Payment Modal */}
            {showMpesaModal && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => {
                  if (!mpesaProcessing) {
                    setShowMpesaModal(false);
                  }
                }}
              >
                <div
                  className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
                  onClick={e => e.stopPropagation()}
                >
      
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">
                        M-PESA Payment
                      </h2>
                    </div>
      
                    <button
                      type="button"
                      disabled={mpesaProcessing}
                      onClick={() => setShowMpesaModal(false)}
                      className="text-slate-400 hover:text-slate-700 text-xl disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
      
                  {/* ============================= */}
                  {/* STK PAYMENT SECTION */}
                  {/* ============================= */}
      
                  <div className="border rounded-xl p-4 mb-2">
      
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-800">
                          M-Pesa Prompt
                        </h3>
      
                        <p className="text-xs text-slate-500">
                          Send a payment request to the customer's phone.
                        </p>
                      </div>
      
                      {mpesaStatus === "pending" && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                          Waiting
                        </span>
                      )}
      
                      {mpesaStatus === "success" && (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          Paid
                        </span>
                      )}
      
                      {mpesaStatus === "failed" && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Failed
                          </span>
                          <p className="max-w-[180px] text-right text-[10px] leading-snug text-red-600/90">
                            {mpesaFailureReason || "Payment request was rejected or timed out. Please retry."}
                          </p>
                        </div>
                      )}
                    </div>
      
                    {/* Phone */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Customer M-PESA Number
                      </label>
      
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="0712345678"
                        value={mpesaDraft.phone}
                        disabled={mpesaProcessing || mpesaStatus === "success"}
                        onChange={e =>
                          setMpesaDraft(prev => ({
                            ...prev,
                            phone: e.target.value
                          }))
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100"
                      />
                    </div>
      
                    {/* Amount */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Amount (Sale total Ksh {cartTotal.toLocaleString()})
                      </label>
      
                      <input
                        type="number"
                        min="1"
                        value={mpesaDraft.amount}
                        disabled={mpesaProcessing || mpesaStatus === "success"}
                        onChange={e =>
                          setMpesaDraft(prev => ({
                            ...prev,
                            amount: e.target.value
                          }))
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100"
                      />
                    </div>
      
                    {/* Pending message */}
                    {mpesaStatus === "pending" && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
      
                        <div className="flex items-center gap-2">
                          <span className="animate-pulse">
                            ⏳
                          </span>
      
                          <span className="text-sm font-medium text-amber-800">
                            Waiting for payment...
                          </span>
                        </div>
      
                        <p className="text-xs text-amber-700 mt-1">
                          Ask the customer to check their phone and
                          enter their M-PESA PIN.
                        </p>
      
                        <button
                          type="button"
                          onClick={refreshMpesaStatus}
                          disabled={
                            mpesaRefreshing ||
                            !mpesaDraft.checkoutRequestId
                          }
                          className="w-full mt-3 border border-amber-300 bg-white hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-amber-800 rounded-lg py-2 text-sm font-medium"
                        >
                          {mpesaRefreshing
                            ? "Checking Payment..."
                            : "↻ Refresh Payment Status"}
                        </button>
      
                      </div>
                    )}
      
                    {/* STK Push button */}
                    {mpesaStatus !== "success" && (
                      <button
                        type="button"
                        onClick={initiateMpesaPayment}
                        disabled={
                          mpesaProcessing ||
                          mpesaStatus === "pending" ||
                          !mpesaDraft.phone.trim() ||
                          !Number(mpesaDraft.amount)
                        }
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg py-2.5 font-semibold text-sm mb-2.5"
                      >
                        {mpesaProcessing
                          ? "Sending STK Push..."
                          : mpesaStatus === "pending"
                            ? "Waiting for Payment..."
                            : "Send STK Push"}
                      </button>
                    )}
      
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      M-PESA Transaction ID
                    </label>
      
                    <input
                      type="text"
                      placeholder="e.g. SH12ABC34D"
                      value={mpesaDraft.transactionId}
                      disabled={mpesaProcessing}
                      onChange={e =>
                        setMpesaDraft(prev => ({
                          ...prev,
                          transactionId:
                            e.target.value.toUpperCase()
                        }))
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100"
                    />
      
                    <button
                      type="button"
                      disabled={
                        mpesaProcessing ||
                        !mpesaDraft.transactionId.trim() ||
                        !Number(mpesaDraft.amount)
                      }
                      onClick={() => {
                        saveMpesaPayment({
                          source: "manual"
                        });
                      }}
                      className="w-full mt-3 border border-green-600 text-green-700 hover:bg-green-50 disabled:border-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg py-2.5 font-semibold text-sm"
                    >
                      Save Manually
                    </button>
      
                    {/* Footer */}
                    <div className="flex gap-2 mt-4">
      
                      <button
                        type="button"
                        disabled={mpesaProcessing}
                        onClick={() => setShowMpesaModal(false)}
                        className="flex-1 border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 rounded-lg py-2.5 text-sm font-medium"
                      >
                        Cancel
                      </button>
      
                      {mpesaStatus === "success" && (
                        <button
                          type="button"
                          onClick={() => {
                            saveMpesaPayment({
                              source: "stk"
                            });
                          }}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 font-semibold text-sm"
                        >
                          ✓ Save Payment
                        </button>
                      )}
      
                      {/* Successful payment */}
                      {mpesaStatus === "success" && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      
                          <div className="flex items-center gap-2 mb-1">
                            <span>✓</span>
      
                            <span className="text-sm font-semibold text-green-800">
                              Payment received
                            </span>
                          </div>
      
                          {mpesaDraft.transactionId && (
                            <div className="text-xs text-green-700 mt-2">
                              <span className="font-medium">
                                M-PESA Receipt:
                              </span>{" "}
                              <span className="font-mono">
                                {mpesaDraft.transactionId}
                              </span>
                            </div>
                          )}
      
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </div>
            )}
    </div>
  );
}
