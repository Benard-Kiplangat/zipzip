import React from "react";
import SyncButton from "../components/SyncButton";
import { showToast } from "../utils/toast";
import { useStockData } from "../hooks/useStockData";
import StockMetricsCard from "../components/StockMetricsCard";
import StockFormCard from "../components/StockFormCard";
import StockProductItemCard from "../components/StockProductItemCard";

export default function Stock() {
  const {
    products,
    filteredProducts,
    visibleProducts,
    search,
    setSearch,
    form,
    saving,
    totalCostValue,
    totalSaleValue,
    expectedProfit,
    handleFormChange,
    handleEdit,
    resetForm,
    saveProduct,
    deleteProduct,
    hardReload,
  } = useStockData();

  const handleSaveSubmit = async () => {
    try {
      const saved = await saveProduct();
      showToast(
        form.id
          ? `Updated spare part product ${saved.name}`
          : `Added spare part product ${saved.name}`
      );
    } catch (e) {
      showToast(e.message || "Failed to save product");
    }
  };

  const handleDeleteConfirm = async (product) => {
    try {
      await deleteProduct(product);
      showToast(`Deleted product ${product.name}`);
    } catch (e) {
      console.error("Failed to delete product", e);
      showToast("Failed to delete product");
    }
  };

  return (
    <div className="p-4 pb-12 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>⚙️</span> Inventory Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track spare parts stock, cost prices, retail selling prices, and re-order thresholds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={hardReload}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl transition-colors"
            title="Reload application state"
          >
            ↻ Hard Refresh
          </button>
          <SyncButton />
        </div>
      </div>

      {/* Metrics Banner */}
      <StockMetricsCard
        totalCostValue={totalCostValue}
        totalSaleValue={totalSaleValue}
        expectedProfit={expectedProfit}
      />

      {/* Product Registration / Edit Form */}
      <StockFormCard
        form={form}
        saving={saving}
        onChange={handleFormChange}
        onSubmit={handleSaveSubmit}
        onCancel={resetForm}
      />

      {/* Inventory Catalog List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>📦 Inventory Catalog</span>
            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {products.length} items
            </span>
          </h2>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="🔍 Search spare parts..."
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Showing {visibleProducts.length} of {filteredProducts.length} matching item(s)
        </div>

        <div className="space-y-3">
          {visibleProducts.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10">
              No spare parts found matching &quot;{search}&quot;
            </div>
          ) : (
            visibleProducts.map((product) => (
              <StockProductItemCard
                key={product._id}
                product={product}
                onEdit={handleEdit}
                onDelete={handleDeleteConfirm}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
