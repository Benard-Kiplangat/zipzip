import React from "react";

export default function StockFormCard({
  form,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      <h2 className="text-base font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-2">
        <span>{form.id ? "✏️ Edit Spare Part Product" : "➕ Register Spare Part Product"}</span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Part / Product Name <span className="text-rose-500">*</span>
          </label>
          <input
            name="name"
            placeholder="e.g. Brake Pads Toyota Hilux 2.5"
            value={form.name}
            onChange={onChange}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Cost Price (KES) <span className="text-rose-500">*</span>
          </label>
          <input
            name="costPrice"
            type="number"
            min="0"
            placeholder="e.g. 1500"
            value={form.costPrice}
            onChange={onChange}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Selling Price (KES) <span className="text-rose-500">*</span>
          </label>
          <input
            name="sellingPrice"
            type="number"
            min="0"
            placeholder="e.g. 2200"
            value={form.sellingPrice}
            onChange={onChange}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Initial Stock Qty <span className="text-rose-500">*</span>
          </label>
          <input
            name="stock"
            type="number"
            min="0"
            placeholder="e.g. 10"
            value={form.stock}
            onChange={onChange}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Low Stock Threshold
          </label>
          <input
            name="lowStockThreshold"
            type="number"
            min="0"
            placeholder="2"
            value={form.lowStockThreshold}
            onChange={onChange}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        {form.id && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2 rounded-xl transition-colors shadow-2xs"
        >
          {saving ? "Saving..." : form.id ? "Update Spare Part" : "Add Spare Part"}
        </button>
      </div>
    </div>
  );
}
