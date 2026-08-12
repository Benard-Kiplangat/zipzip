import PouchDB from "pouchdb-browser";

const electronApi = typeof window !== "undefined" ? window.electronAPI : null;

const createElectronDb = () => ({
  allDocs: (options = {}) => electronApi?.allDocs?.(options) ?? Promise.resolve({ rows: [] }),
  get: (id, options = {}) => electronApi?.get?.(id, options) ?? Promise.resolve(null),
  put: (doc) => electronApi?.put?.(doc) ?? Promise.resolve(doc),
  remove: (doc) => electronApi?.remove?.(doc) ?? Promise.resolve(doc),
  destroy: () => electronApi?.destroy?.() ?? Promise.resolve(true),
});

let db = electronApi ? createElectronDb() : new PouchDB("posdb");

export function resetDb() {
  if (electronApi) {
    return electronApi.resetDb?.() ?? Promise.resolve(db);
  }

  return db.destroy().catch((error) => {
    const message = String(error?.message || error || "");
    if (!/not found|missing/i.test(message)) {
      throw error;
    }
  }).then(() => {
    db = new PouchDB("posdb");
    return db;
  });
}

export { db };