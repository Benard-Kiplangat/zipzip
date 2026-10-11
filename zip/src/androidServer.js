import { Capacitor } from '@capacitor/core';
import { createSqliteDbService } from './sqliteDb.capacitor.js';
import { backupService } from './backupService.capacitor.js';

export async function startAndroidBosco() {
  if (!Capacitor.isNativePlatform()) return;

  const service = createSqliteDbService();
  await service.allDocs({ limit: 1 });

  const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const dbInstance = await sqlite.retrieveConnection("bosco", false);

  setInterval(() => {
    backupService.hourlyCheck(dbInstance, "Backups");
  }, 60*1000);

  window.electronAPI = {
    allDocs: (o) => service.allDocs(o),
    get: (id) => service.get(id),
    put: (doc) => service.put(doc),
    remove: (doc) => service.remove(doc),
    destroy: () => service.destroy(),
    resetDb: () => service.resetDb(),
    hardRefresh: () => window.location.reload(),
    createBackup: () => backupService.performBackup(dbInstance, "Backups"),
    restoreBackup: async () => {
      const files = await backupService.getBackupFiles("Backups");
      return { files, canceled: false, merge: service.mergeBackup };
    }
  };
}
