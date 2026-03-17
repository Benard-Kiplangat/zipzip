import React from "react";

export default function ProductSummary({ productSummaries = {} }) {
  return (
    <>
      <h2 className="text-lg font-semibold mb-2 mt-4">Sales Summary by Product</h2>
      <div className="space-y-3">
        {Object.entries(productSummaries).length === 0 && (
          <div className="text-sm text-gray-600">No product summary available.</div>
        )}
        {Object.entries(productSummaries).map(([name, s], i) => (
          <div key={i} className="border p-3 rounded bg-gray-50">
            <strong>{name}</strong>
            <div>Total Sold: {s.quantity}</div>
            <div>Total Revenue: KES {s.revenue}</div>
            <div>Total Profit: KES {s.profit}</div>
          </div>
        ))}
      </div>
    </>
  );
}
