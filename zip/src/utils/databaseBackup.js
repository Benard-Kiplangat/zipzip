import { db } from "../db";

let pendingBackup;

export function saveDatabaseBackup() {
  if (!pendingBackup) {
    pendingBackup = (async () => {
      const backup = await db.createBackup();
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Backup save failed (${response.status}).`);
      }
      return result;
    })().finally(() => {
      pendingBackup = null;
    });
  }
  return pendingBackup;
}
