import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { db } from "../db";

const emptyForm = {
  name: "",
  costPrice: "",
  sellingPrice: "",
  stock: "",
  lowStockThreshold: "",
  id: null,
};

export function useStockData() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [totalCostValue, setTotalCostValue] = useState(0);
  const [totalSaleValue, setTotalSaleValue] = useState(0);

  const loadProducts = async () => {
    try {
      const result = await db.allDocs({
        include_docs: true,
        startkey: "product",
        endkey: "product\uffff",
      });
      const items = result.rows
        .map((row) => row.doc)
        .filter((doc) => doc && doc.type === "product")
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setProducts(items);

      let cost = 0;
      let sale = 0;
      items.forEach((item) => {
        cost += (Number(item.stock) || 0) * (Number(item.costPrice) || 0);
        sale += (Number(item.stock) || 0) * (Number(item.sellingPrice) || 0);
      });
      setTotalCostValue(cost);
      setTotalSaleValue(sale);
    } catch (e) {
      console.error("Failed to load products in stock hook", e);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadProducts();
    };

    window.addEventListener("bosco:db-changed", handleDataRefresh);
    return () => window.removeEventListener("bosco:db-changed", handleDataRefresh);
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name || "",
      costPrice: product.costPrice ?? "",
      sellingPrice: product.sellingPrice ?? "",
      stock: product.stock ?? "",
      lowStockThreshold: product.lowStockThreshold ?? "",
      id: product._id,
      _rev: product._rev,
    });
  };

  const saveProduct = async () => {
    if (!form.name || form.costPrice === "" || form.sellingPrice === "" || form.stock === "") {
      throw new Error("Please fill in Product Name, Cost Price, Selling Price, and Stock Quantity.");
    }

    setSaving(true);
    try {
      const existing = products.find(
        (p) => p.name.toLowerCase() === form.name.trim().toLowerCase()
      );

      let savedDoc;
      if (existing && !form.id) {
        existing.stock = (Number(existing.stock) || 0) + parseInt(form.stock, 10);
        if (form.lowStockThreshold !== "")
          existing.lowStockThreshold = Number(form.lowStockThreshold);
        savedDoc = { ...existing };
        await db.put(savedDoc);
      } else if (form.id) {
        const doc = {
          _id: form.id,
          _rev: form._rev,
          type: "product",
          name: form.name.trim(),
          costPrice: Number(form.costPrice),
          sellingPrice: Number(form.sellingPrice),
          stock: Number(form.stock),
        };
        if (form.lowStockThreshold !== "")
          doc.lowStockThreshold = Number(form.lowStockThreshold);
        savedDoc = doc;
        await db.put(doc);
      } else {
        const doc = {
          _id: `product_${Date.now()}`,
          type: "product",
          name: form.name.trim(),
          costPrice: Number(form.costPrice),
          sellingPrice: Number(form.sellingPrice),
          stock: Number(form.stock),
        };
        if (form.lowStockThreshold !== "")
          doc.lowStockThreshold = Number(form.lowStockThreshold);
        savedDoc = doc;
        await db.put(doc);
      }

      resetForm();
      await loadProducts();
      return savedDoc;
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    await db.remove(product);
    await loadProducts();
  };

  const hardReload = async () => {
    if (window.electronAPI?.hardRefresh) {
      await window.electronAPI.hardRefresh();
    } else {
      window.location.reload();
    }
  };

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) => (p.name || "").toLowerCase().includes(query));
  }, [products, deferredSearch]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, 100),
    [filteredProducts]
  );

  const expectedProfit = useMemo(
    () => totalSaleValue - totalCostValue,
    [totalSaleValue, totalCostValue]
  );

  return {
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
    reloadProducts: loadProducts,
  };
}
