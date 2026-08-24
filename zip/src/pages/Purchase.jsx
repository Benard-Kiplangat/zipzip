import React from "react";
import { useAuth } from "../context/AuthContext";
import { showToast } from "../utils/toast";
import { usePurchaseData } from "../hooks/usePurchaseData";
import PurchaseProductItem from "../components/PurchaseProductItem";
import BulkStockInputCard from "../components/BulkStockInputCard";
import PurchaseHistoryCard from "../components/PurchaseHistoryCard";

export default function Purchase() {
  const { canViewStock } = useAuth();
  const {
    filteredProducts,
    search,
    setSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    metrics,
    filteredPurchases,
    addStockToProduct,
    bulkImportStock,
  } = usePurchaseData();

  const handleAddStock = async (productId, quantity) => {
    try {
      const res = await addStockToProduct(productId, quantity);
      showToast(`Added ${res.addedQty} unit(s) to ${res.name} — Stock: ${res.newStock}`);
    } catch (e) {
      console.error("Failed to add stock", e);
      showToast("Failed to add stock. Please try again.");
    }
  };

  const handleBulkImport = async (bulkText) => {
    try {
      const count = await bulkImportStock(bulkText);
      showToast(`Bulk import complete: ${count} product(s) updated`);
    } catch (e) {
      console.error("Bulk import failed", e);
      showToast(e.message || "Bulk import failed");
    }
  };

  return (
    <div className="p-4 pb-12 max-w-full space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Purchase & Stock Replenishment</h1>
        <p className="text-xs text-slate-500">
          Add stock to existing products, import bulk shipments, and monitor purchase history.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Bulk Stock Import Form */}
          <BulkStockInputCard onBulkImport={handleBulkImport} />

          {/* Product Search */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
            <label className="block font-bold text-slate-900 text-sm">
              Search & Replenish Stock
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search existing products by name..."
            />
          </div>

          {/* Product Items List */}
          <div className="space-y-3">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-10 bg-white border rounded-2xl text-slate-400 text-sm">
                No products found matching &quot;{search}&quot;
              </div>
            ) : (
              filteredProducts.map((product) => (
                <PurchaseProductItem
                  key={product._id}
                  product={product}
                  canViewStock={canViewStock}
                  onAddStock={handleAddStock}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Column (1/3 width) */}
        <div className="w-full">
          <PurchaseHistoryCard
            metrics={metrics}
            filteredPurchases={filteredPurchases}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        </div>
      </div>
    </div>
  );
}
