import React, { useState } from "react";

export default function BulkStockInputCard({ onBulkImport }) {
  const [bulkInput, setBulkInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async () => {
    if (!bulkInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onBulkImport(bulkInput);
      setBulkInput("");
    } catch (e) {
      /* handled in parent via toast/alert */
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInsertSample = () => {
    setBulkInput(
      `Oil Filter, 350, 500, 10\nSpark Plug, 150, 250, 20\nBrake Pads, 1200, 1800, 5`
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <span>📦 Bulk Stock Import</span>
          <span className="text-[11px] font-normal text-slate-500">
            (Format: Name, Buying Price, Selling Price, Qty)
          </span>
        </label>
        <button
          type="button"
          onClick={handleInsertSample}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 self-start sm:self-auto"
        >
          + Load Sample
        </button>
      </div>

      <textarea
        value={bulkInput}
        onChange={(e) => setBulkInput(e.target.value)}
        className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[96px]"
        placeholder="e.g.: Air Filter, 300, 450, 10"
      />

      <div className="flex justify-between items-center pt-1">
        <span className="text-xs text-slate-400">
          {bulkInput.trim() ? `${bulkInput.trim().split(/\r?\n/).length} lines entered` : "Paste multiple lines"}
        </span>
        <button
          onClick={handleImport}
          disabled={!bulkInput.trim() || isSubmitting}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-2xs transition-colors"
        >
          {isSubmitting ? "Importing..." : "Add Bulk Stock"}
        </button>
      </div>
    </div>
  );
}
