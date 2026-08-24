import PouchDB from "pouchdb-browser";

const electronApi = typeof window !== "undefined" ? window.electronAPI : null;

const createElectronDb = () => ({
  allDocs: (options = {}) => electronApi?.allDocs?.(options) ?? Promise.resolve({ rows: [] }),
  get: (id, options = {}) => electronApi?.get?.(id, options) ?? Promise.resolve(null),
  put: (doc) => electronApi?.put?.(doc) ?? Promise.resolve(doc),
  remove: (doc) => electronApi?.remove?.(doc) ?? Promise.resolve(doc),
  destroy: () => electronApi?.destroy?.() ?? Promise.resolve(true),
  createIndex: (options) => electronApi?.createIndex?.(options) ?? Promise.resolve({ result: "created" }),
  find: (options) => electronApi?.find?.(options) ?? Promise.resolve({ docs: [] }),
});

let db = electronApi ? createElectronDb() : new PouchDB("posdb");

export async function initDbIndexes() {
  if (electronApi) return;
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

  return db
    .destroy()
    .catch((error) => {
      const message = String(error?.message || error || "");
      if (!/not found|missing/i.test(message)) {
        throw error;
      }
    })
    .then(() => {
      db = new PouchDB("posdb");
      initDbIndexes().catch(() => {});
      return db;
    });
}

export { db };
