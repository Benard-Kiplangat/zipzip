import PouchDB from "pouchdb-browser";
import { Capacitor } from "@capacitor/core";
import { createSqliteDbService } from "./sqliteDb.capacitor";

const electronApi = typeof window !== "undefined" ? window.electronAPI : null;
const isCapacitorNative = Capacitor.isNativePlatform();
export const usesPouchDb = !electronApi && !isCapacitorNative;

const createElectronDb = () => ({
  allDocs: (options = {}) => electronApi?.allDocs?.(options) ?? Promise.resolve({ rows: [] }),
  get: (id, options = {}) => electronApi?.get?.(id, options) ?? Promise.resolve(null),
  put: (doc) => electronApi?.put?.(doc) ?? Promise.resolve(doc),
  remove: (doc) => electronApi?.remove?.(doc) ?? Promise.resolve(doc),
  seedSyncChanges: (startDate) => {
    if (!electronApi?.seedSyncChanges) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.seedSyncChanges(startDate);
  },
  mergeBackup: () => {
    if (!electronApi?.mergeBackup) {
      return Promise.reject(new Error("This Electron version does not support merge backup."));
    }
    return electronApi.mergeBackup();
  },
  getPendingSyncChanges: (limit, startDate) => {
    if (!electronApi?.getPendingSyncChanges) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.getPendingSyncChanges(limit, startDate);
  },
  queueSyncDoc: (doc) => {
    if (!electronApi?.queueSyncDoc) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.queueSyncDoc(doc);
  },
  markSyncChangeSynced: (id, updatedAt) => {
    if (!electronApi?.markSyncChangeSynced) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.markSyncChangeSynced(id, updatedAt);
  },
  applyRemoteSyncDoc: (doc) => {
    if (!electronApi?.applyRemoteSyncDoc) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.applyRemoteSyncDoc(doc);
  },
  getSyncState: (key) => {
    if (!electronApi?.getSyncState) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.getSyncState(key);
  },
  setSyncState: (key, value) => {
    if (!electronApi?.setSyncState) {
      return Promise.reject(new Error("This Electron version does not support online sync."));
    }
    return electronApi.setSyncState(key, value);
  },
  acknowledgeSyncBaseline: (key, value) => {
    if (!electronApi?.acknowledgeSyncBaseline) {
      return Promise.reject(new Error("This Electron version does not support baseline sync setup."));
    }
    return electronApi.acknowledgeSyncBaseline(key, value);
  },
  destroy: () => electronApi?.destroy?.() ?? Promise.resolve(true),
  createIndex: (options) => electronApi?.createIndex?.(options) ?? Promise.resolve({ result: "created" }),
  find: (options) => electronApi?.find?.(options) ?? Promise.resolve({ docs: [] }),
});

function wrapPouchDbWrites(database) {
  const originalGet = database.get.bind(database);
  const originalPut = database.put.bind(database);

  const getCurrentDoc = async (id) => {
    try {
      return await originalGet(id);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };

  database.put = async (doc, ...args) => {
    const previous = doc._id ? await getCurrentDoc(doc._id) : null;
    return originalPut(
      { ...doc, updatedAt: nextUpdatedAt(previous?.updatedAt) },
      ...args,
    );
  };

  database.remove = async (doc, ...args) => {
    const current =
      typeof doc === "string" ? await getCurrentDoc(doc) : await getCurrentDoc(doc._id);
    if (!current) {
      const error = new Error("missing");
      error.status = 404;
      throw error;
    }
    return originalPut(
      {
        ...current,
        ...(typeof doc === "object" ? doc : {}),
        _deleted: true,
        updatedAt: nextUpdatedAt(current.updatedAt),
      },
      ...args,
    );
  };

  return database;
}

function nextUpdatedAt(previousUpdatedAt) {
  const previousTime = Date.parse(previousUpdatedAt || "");
  return new Date(
    Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1),
  ).toISOString();
}

let db = electronApi
  ? createElectronDb()
  : isCapacitorNative
    ? createSqliteDbService()
    : wrapPouchDbWrites(new PouchDB("posdb"));

export async function initDbIndexes() {
  if (electronApi || isCapacitorNative) return;
  try {
    if (typeof db.createIndex === "function") {
      await Promise.all([
        db.createIndex({ index: { fields: ["type"] } }),
        db.createIndex({ index: { fields: ["type", "name"] } }),
        db.createIndex({ index: { fields: ["type", "timestamp"] } }),
        db.createIndex({ index: { fields: ["type", "isCreditSale"] } }),
      ]);
    }
  } catch (err) {
    console.warn("Db index initialization warning:", err);
  }
}

// Automatically trigger background index creation
initDbIndexes().catch(() => {});

export function resetDb() {
  if (electronApi) {
    return electronApi.resetDb?.() ?? Promise.resolve(db);
  }
  if (isCapacitorNative) {
    return db.resetDb();
  }

  return db
    .destroy()
    .catch((error) => {
      const message = String(error?.message || error || "");
      if (!/not found|missing/i.test(message)) {
        throw error;
      }
    })
    .then(() => {
      db = wrapPouchDbWrites(new PouchDB("posdb"));
      initDbIndexes().catch(() => {});
      return db;
    });
}

export { db };
