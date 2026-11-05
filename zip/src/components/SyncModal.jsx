import { useState, useEffect } from "react";
import { syncSales } from "./salesSync"

export default function SyncModal({ isOpen, onClose }) {
  const [syncProgress, setSyncProgress] = useState({
    stage: "idle",
    message: "ready to sync",
  });
  const [syncStatus, setSyncStatus] = useState({
    status: "idle",
  });
  

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

    // Start syncing immediately, then continue every five minutes even while
    // the modal is closed (as long as this component remains mounted).
    runSync();
    const interval = setInterval(runSync, 60 * 60 * 1000);

    window.addEventListener("online", runSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", runSync);
    };
  }, []);

  if (!isOpen) return null;

  const handleSyncSales = async () => {
    if (syncStatus.status === "syncing") return;

    try {
      setSyncStatus("Syncing");
      setSyncProgress({
        stage: "Starting",
        message: "Starting synchonization...",
      })
      await syncSales({
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
      })
      setSyncStatus({
        stage: "complete",
        message: "Synchronization completed successfully.",
      })
    } catch (error) {
      setSyncStatus({ status: "error" })
      setSyncProgress({
        stage: "error",
        message: error.message || "Synchronization failed.",
      });
    }
  }

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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${syncProgress.stage === "error"
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
       {syncProgress.message}{syncProgress.stage === "complete" ? ` Imported ${syncProgress.downloaded}; Uploaded ${syncProgress.uploaded}; Inserted ${syncProgress.inserted}` : ""}
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
      </div>
    </div>
  );
}