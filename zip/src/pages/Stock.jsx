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
    <div className="p-4 pb-12 max-w-6xl space-t-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>⚙️</span> Inventory Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track spare parts stock, cost prices, retail selling prices, and re-order thresholds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
        </div>
      </div>
      {/* Main Grid */}
      <div className="grid gap-2 lg:grid-cols-3">
        {/* Left Column (2/3 width) */}
        <div className="max-w-2xl lg:col-span-2 pb-12 space-y-4">
          {/* Metrics Banner */}
          <div className="w-full lg:hidden">
          <StockMetricsCard
            totalCostValue={totalCostValue}
            totalSaleValue={totalSaleValue}
            expectedProfit={expectedProfit}
          />
          </div>

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
            <div className="flex flex-col justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 flex justify-between items-center gap-2">
                <span>📦 Inventory Catalog</span>
                <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {products.length.toLocaleString()} items
                </span>
              </h2>

              <div className="w-full">
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
<div className="w-full my-4 space-y-4 hidden lg:block">
            <StockMetricsCard
            totalCostValue={totalCostValue}
            totalSaleValue={totalSaleValue}
            expectedProfit={expectedProfit}
          />
          </div>
      </div>
    </div>
  );
}
