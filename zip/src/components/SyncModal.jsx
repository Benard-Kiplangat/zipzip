import React, { useState, useEffect } from "react";
import {
  getStoredSyncConfig,
  saveSyncConfig,
  subscribeSyncStatus,
  testConnection,
  acknowledgeImportedBaseline,
} from "../utils/syncService";
import { usesPouchDb } from "../db";
import { useBusinessConfig } from "../config";
import { showToast } from "../utils/toast";

export default function SyncModal({ isOpen, onClose }) {
  const { config } = useBusinessConfig();
  const businessCode = String(config.businessCode || "").trim().toLowerCase();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [startDate, setStartDate] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [statusObj, setStatusObj] = useState({
    status: "idle",
    lastSyncTime: null,
    errorMessage: "",
    progressMessage: "",
  });
  const [testing, setTesting] = useState(false);
  const [baselineSetup, setBaselineSetup] = useState(false);

  useEffect(() => {
    const config = getStoredSyncConfig();
    setUrl(config.url);
    setApiKey(config.apiKey || "");
    setStartDate(toLocalDateTime(config.startDate));
    setEnabled(config.enabled);
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatusObj);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
  let running = false;

  const runSync = async () => {
    if (running || !navigator.onLine) return;

    running = true;

    try {
      await syncSales({
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
      });
    } catch (error) {
      console.error("Automatic sales sync failed:", error);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(runSync, 5 * 60 * 1000);

  window.addEventListener("online", runSync);

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", runSync);
  };
}, []);

  if (!isOpen) return null;

  const handleSave = () => {
    if (enabled && (!url.trim() || !apiKey.trim())) {
      showToast("Enter the sync server URL and key before enabling sync.");
      return;
    }
    let syncUrl = url;
    if (url.trim()) {
      try {
        syncUrl = getBusinessSyncUrl(url, businessCode);
        setUrl(syncUrl);
      } catch (error) {
        showToast(`Invalid sync server URL: ${error.message}`);
        return;
      }
    }
    const startDateTimestamp = new Date(startDate).getTime();
    if (!startDate || Number.isNaN(startDateTimestamp)) {
      showToast("Enter a valid sync start date.");
      return;
    }
    try {
      saveSyncConfig(syncUrl, enabled, apiKey, new Date(startDateTimestamp).toISOString());
    } catch (error) {
      showToast(`Unable to save sync settings: ${error.message}`);
      return;
    }
    showToast(
      enabled
        ? "Multi-device online sync enabled!"
        : "Online sync disabled"
    );
    onClose();
  };

  const handleTest = async () => {
    if (!url.trim()) {
      showToast("Please enter a remote server URL first.");
      return;
    }
    setTesting(true);
    try {
      const syncUrl = getBusinessSyncUrl(url, businessCode);
      setUrl(syncUrl);
      const info = await testConnection(syncUrl, apiKey);
      showToast(`Connection Successful! Server database: ${info.db_name || "Online DB"}`);
    } catch (e) {
      showToast(`Connection Failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleImportedBaseline = async () => {
    if (!url.trim() || !apiKey.trim()) {
      showToast("Enter the sync server URL and key before starting baseline sync.");
      return;
    }

    let syncUrl;
    try {
      syncUrl = getBusinessSyncUrl(url, businessCode);
    } catch (error) {
      showToast(`Invalid sync server URL: ${error.message}`);
      return;
    }

    const confirmed = window.confirm(
      "Use this only on a device that already has the same complete imported dataset as the sync server. The current remote records will be treated as already present, and this device's queued baseline will not be uploaded. Any local changes made since import will also be skipped. Continue?",
    );
    if (!confirmed) return;

    setBaselineSetup(true);
    try {
      const startDateTimestamp = new Date(startDate).getTime();
      if (!startDate || Number.isNaN(startDateTimestamp)) {
        throw new Error("Enter a valid sync start date.");
      }
      saveSyncConfig(
        syncUrl,
        false,
        apiKey,
        new Date(startDateTimestamp).toISOString(),
      );
      await acknowledgeImportedBaseline(syncUrl, apiKey);
      saveSyncConfig(
        syncUrl,
        true,
        apiKey,
        new Date(startDateTimestamp).toISOString(),
      );
      setUrl(syncUrl);
      setEnabled(true);
      showToast("Imported baseline acknowledged. Syncing new changes only.");
      onClose();
    } catch (error) {
      showToast(`Unable to start baseline sync: ${error.message}`);
    } finally {
      setBaselineSetup(false);
    }
  };

  const renderBadge = () => {
    switch (statusObj.status) {
      case "online":
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Online & Connected
          </span>
        );
      case "syncing":
        return (
          <span className="bg-blue-100 text-blue-800 border border-blue-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-spin" />
            Syncing Data...
          </span>
        );
      case "offline":
        return (
          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-bold">
            ⚪ Offline (Retrying)
          </span>
        );
      case "error":
        return (
          <span className="bg-rose-100 text-rose-800 border border-rose-300 text-xs px-2.5 py-1 rounded-full font-bold">
            ⚠️ Connection Error
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 border border-slate-200 text-xs px-2.5 py-1 rounded-full font-bold">
            Sync Idle
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <span>📡 Multi-Device Online Sync</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-xs font-bold text-slate-700">Sync Health</span>
            {renderBadge()}
          </div>

          {statusObj.progressMessage && (
            <div className="text-xs text-blue-700 bg-blue-50 p-2.5 rounded-xl border border-blue-100">
              {statusObj.progressMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Online Sync Server URL
            </label>
            <input
              type="url"
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`e.g. https://sync.example.com/${businessCode || "yl"}/db/posdb`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              This device is configured for business code <strong>{businessCode || "not set"}</strong>.
              Use the server URL for this business. Devices sharing a business must use the same business code and URL.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Sync changes from
            </label>
            <input
              type="datetime-local"
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Only records created or modified on or after this date will sync. The server keeps changes for 24 hours; devices offline longer must be refreshed using export/import.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Sync Server Key
            </label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Key configured by your server administrator"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Use the same key configured as SYNC_API_KEY on the sync server.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-100">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={baselineSetup}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Enable Local-First Sync</div>
              <div className="text-[11px] text-slate-500">
                Sync only changes through the JSON feed every 30 seconds and when this device reconnects.
              </div>
            </div>
          </label>

          {statusObj.lastSyncTime && (
            <div className="text-[11px] text-slate-400 text-center">
              Last synced: {new Date(statusObj.lastSyncTime).toLocaleString()}
            </div>
          )}

          {statusObj.errorMessage && (
            <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
              {statusObj.errorMessage}
            </div>
          )}

          {!usesPouchDb && !enabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-[11px] text-amber-900">
                On a device that already has the same imported baseline as the server, acknowledge it to begin syncing only later changes.
              </p>
              <button
                type="button"
                onClick={handleImportedBaseline}
                disabled={baselineSetup || testing}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition-colors"
              >
                {baselineSetup ? "Acknowledging imported data..." : "Use Imported Baseline & Start Sync"}
              </button>
            </div>
          )}

          <div className="space-y-3">
  <div className="flex items-center justify-between">
    <span className="font-medium">Sales synchronization</span>

    <span
      className={`text-sm ${
        syncProgress.stage === "error"
          ? "text-red-600"
          : syncProgress.stage === "complete"
          ? "text-green-600"
          : "text-amber-600"
      }`}
    >
      {syncProgress.stage === "complete"
        ? "Completed"
        : syncProgress.stage === "error"
        ? "Failed"
        : syncProgress.stage === "idle"
        ? "Ready"
        : "In progress"}
    </span>
  </div>

  <p className="text-sm text-gray-600">
    {syncProgress.message}
  </p>

  {syncStatus.status === "syncing" && (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500" />
    </div>
  )}

  <button
    type="button"
    onClick={handleSyncSales}
    disabled={syncStatus.status === "syncing"}
    className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
  >
    {syncStatus.status === "syncing"
      ? "Syncing..."
      : "Sync Now"}
  </button>
</div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || baselineSetup}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl transition-colors"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={baselineSetup}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-colors shadow-2xs"
            >
              Save & Apply Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function getBusinessSyncUrl(input, businessCode) {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(businessCode)) {
    throw new Error("Set a valid business code in Business Settings first.");
  }
  const target = new URL(input.trim());
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Use an HTTP or HTTPS URL.");
  }
  const basePath = target.pathname
    .replace(/\/+$/, "")
    .replace(/(?:\/[a-z0-9][a-z0-9-]{0,31})?\/db\/posdb$/i, "");
  target.pathname = `${basePath}/${businessCode}/db/posdb`.replace(/\/{2,}/g, "/");
  target.search = "";
  target.hash = "";
  return target.toString().replace(/\/$/, "");
}
