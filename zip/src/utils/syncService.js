import PouchDB from "pouchdb-browser";
import { db, usesPouchDb } from "../db";

const SYNC_URL_KEY = "bosco_remote_sync_url";
const SYNC_ENABLED_KEY = "bosco_remote_sync_enabled";
const SYNC_API_KEY = "bosco_remote_sync_api_key";
const SYNC_START_DATE_KEY = "bosco_remote_sync_start_date";
const POLL_INTERVAL_MS = 5 * 1000;
const INITIAL_RETRY_DELAY_MS = 1 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const SYNC_BATCH_SIZE = 100;
const SYNC_OUTBOX_VERSION = 2;

let syncHandler = null;
let syncTimer = null;
let syncWakeHandler = null;
let syncRunningGeneration = null;
let syncGeneration = 0;
let retryDelayMs = INITIAL_RETRY_DELAY_MS;
let statusListeners = new Set();
let currentStatus = {
  status: "idle",
  lastSyncTime: null,
  errorMessage: "",
  progressMessage: "",
};

export function getStoredSyncConfig() {
  try {
    let startDate = localStorage.getItem(SYNC_START_DATE_KEY);
    if (!startDate || Number.isNaN(Date.parse(startDate))) {
      startDate = new Date().toISOString();
      localStorage.setItem(SYNC_START_DATE_KEY, startDate);
    }
    return {
      url: localStorage.getItem(SYNC_URL_KEY) || "",
      enabled: localStorage.getItem(SYNC_ENABLED_KEY) === "true",
      apiKey: localStorage.getItem(SYNC_API_KEY) || "",
      startDate: new Date(startDate).toISOString(),
    };
  } catch (error) {
    console.error("Failed to read sync configuration:", error);
    return {
      url: "",
      enabled: false,
      apiKey: "",
      startDate: new Date().toISOString(),
    };
  }
}

export function saveSyncConfig(url, enabled, apiKey = "", startDate) {
  try {
    const parsedStartDate = Date.parse(startDate || getStoredSyncConfig().startDate);
    if (Number.isNaN(parsedStartDate)) {
      throw new Error("Enter a valid sync start date.");
    }
    localStorage.setItem(SYNC_URL_KEY, url.trim());
    localStorage.setItem(SYNC_ENABLED_KEY, enabled ? "true" : "false");
    localStorage.setItem(SYNC_API_KEY, apiKey.trim());
    localStorage.setItem(SYNC_START_DATE_KEY, new Date(parsedStartDate).toISOString());
  } catch (error) {
    updateStatus({
      status: "error",
      errorMessage: "Unable to save sync settings on this device.",
    });
    throw error;
  }

  if (enabled) {
    startSync(url.trim(), apiKey.trim());
  } else {
    stopSync();
  }
}

function updateStatus(newStatusObj) {
  currentStatus = { ...currentStatus, ...newStatusObj };
  statusListeners.forEach((listener) => listener(currentStatus));
}

export function subscribeSyncStatus(listener) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

export function stopSync() {
  syncGeneration += 1;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (syncHandler) {
    syncHandler.cancel();
    syncHandler = null;
  }
  if (syncWakeHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", syncWakeHandler);
    window.removeEventListener("online", syncWakeHandler);
    syncWakeHandler = null;
  }
  retryDelayMs = INITIAL_RETRY_DELAY_MS;
  updateStatus({ status: "idle", errorMessage: "", progressMessage: "" });
}

function syncOptions(apiKey) {
  return {
    skip_setup: false,
    auth: { username: "sync", password: apiKey },
    ajax: { timeout: REQUEST_TIMEOUT_MS },
  };
}

export function startSync(remoteUrlOverride, apiKeyOverride) {
  stopSync();
  const generation = syncGeneration;
  retryDelayMs = INITIAL_RETRY_DELAY_MS;

  const config = getStoredSyncConfig();
  const targetUrl =
    (remoteUrlOverride === undefined ? config.url : remoteUrlOverride || "").trim();
  const apiKey =
    (apiKeyOverride === undefined ? config.apiKey : apiKeyOverride || "").trim();
  const syncStartDate = config.startDate;

  if (!targetUrl || !apiKey) {
    updateStatus({
      status: "error",
      errorMessage: !targetUrl
        ? "No remote server URL configured."
        : "Enter the sync server key configured by your administrator.",
    });
    return;
  }

  let remoteDb;
  try {
    remoteDb = new PouchDB(targetUrl, syncOptions(apiKey));
  } catch (error) {
    console.error("Failed to initialize remote sync database:", error);
    updateStatus({
      status: "error",
      errorMessage: error.message || "Invalid remote URL format.",
    });
    return;
  }

  if (usesPouchDb) {
    updateStatus({
      status: "syncing",
      errorMessage: "",
      progressMessage: "Connecting to the sync server...",
    });
    let replicatedCount = 0;
    syncHandler = PouchDB.sync(db, remoteDb, {
      live: true,
      retry: true,
      selector: syncSelector(syncStartDate),
      back_off_function: (delay) => (delay === 0 ? 1000 : Math.min(delay * 2, 60000)),
    })
      .on("change", (info) => {
        if (generation !== syncGeneration) return;
        const docs = info.change?.docs || [];
        replicatedCount += docs.length;
        updateStatus({
          status: "syncing",
          errorMessage: "",
          progressMessage: `Processed ${replicatedCount} records...`,
        });
        dispatchDbChanged(docs);
      })
      .on("paused", (error) => {
        if (generation !== syncGeneration) return;
        if (error) {
          updateStatus({
            status: "offline",
            errorMessage: error.message || "Connection paused. Retrying...",
            progressMessage: "PouchDB retry is enabled; waiting for the connection to recover...",
          });
        } else {
          updateStatus({
            status: "online",
            lastSyncTime: new Date().toISOString(),
            errorMessage: "",
            progressMessage: "",
          });
        }
      })
      .on("active", () => {
        if (generation === syncGeneration) {
          updateStatus({
            status: "syncing",
            errorMessage: "",
            progressMessage: "Syncing changes...",
          });
        }
      })
      .on("denied", (error) => {
        if (generation !== syncGeneration) return;
        console.error("Sync denied:", error);
        updateStatus({
          status: "error",
          errorMessage: "Access denied. Check the configured sync server key.",
          progressMessage: "",
        });
      })
      .on("error", (error) => {
        if (generation !== syncGeneration) return;
        console.error("Sync error:", error);
        updateStatus({
          status: "error",
          errorMessage: error.message || "Failed to connect to remote sync server.",
          progressMessage: "",
        });
      });
    return;
  }

  if (typeof document !== "undefined") {
    syncWakeHandler = () => {
      if (document.visibilityState === "visible") {
        runScheduledAdapterSync(remoteDb, targetUrl, generation, syncStartDate);
      }
    };
    document.addEventListener("visibilitychange", syncWakeHandler);
    window.addEventListener("online", syncWakeHandler);
  }
  runScheduledAdapterSync(remoteDb, targetUrl, generation, syncStartDate);
}

function handleAdapterSyncError(error, generation, remoteDb, targetUrl, syncStartDate) {
  console.error("Online sync failed:", error);
  if (generation !== syncGeneration) return;
  const status = Number(error.status || error.statusCode);
  const denied = status === 401 || status === 403;
  const permanentClientError = status === 400 || denied;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  updateStatus({
    status: permanentClientError ? "error" : "offline",
    progressMessage: "",
    errorMessage: describeSyncError(error, denied),
  });
  if (!permanentClientError) {
    updateStatus({
      progressMessage: `Retrying sync in ${Math.ceil(delay / 1000)} seconds...`,
    });
    scheduleAdapterSyncRetry(delay, generation, remoteDb, targetUrl, syncStartDate);
  }
}

function describeSyncError(error, denied) {
  if (denied) return "Access denied. Check the configured sync server key.";
  const status = Number(error.status || error.statusCode);
  if (status === 404) {
    return "Sync database not found. Check that the URL ends with the correct /<business-code>/db/posdb path.";
  }
  if (status >= 400 && status < 500) {
    return `Sync server rejected the request (${status}): ${error.message || "Check the sync URL and server configuration."}`;
  }
  if (
    error.name === "SyntaxError" &&
    /json|unexpected token|unexpected end/i.test(error.message || "")
  ) {
    return "The sync endpoint returned a non-JSON response. Check the database URL and reverse-proxy routing.";
  }
  if (error.message === "missing" || error.name === "not_found") {
    return "A requested sync record was not found. The sync will continue after reconciling the record.";
  }
  return error.message || "Unable to reach the sync server.";
}

function runScheduledAdapterSync(remoteDb, targetUrl, generation, syncStartDate) {
  runAdapterSync(remoteDb, targetUrl, generation, syncStartDate).catch((error) =>
    handleAdapterSyncError(error, generation, remoteDb, targetUrl, syncStartDate),
  );
}

function scheduleAdapterSyncRetry(delay, generation, remoteDb, targetUrl, syncStartDate) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    runScheduledAdapterSync(remoteDb, targetUrl, generation, syncStartDate);
  }, delay);
}

async function runAdapterSync(remoteDb, targetUrl, generation, syncStartDate) {
  if (syncRunningGeneration === generation || generation !== syncGeneration) return;
  syncRunningGeneration = generation;
  try {
    let state = await db.getSyncState(targetUrl);
    if (!state) {
      state = { initialized: false, lastSequence: 0, outboxVersion: 0 };
    }
    if (
      state.outboxVersion !== SYNC_OUTBOX_VERSION ||
      state.syncStartDate !== syncStartDate
    ) {
      updateStatus({
        status: "syncing",
        errorMessage: "",
        progressMessage: "Preparing changes from the sync start date...",
      });
      await db.seedSyncChanges(syncStartDate);
      state = {
        ...state,
        initialized: true,
        lastSequence: state.lastSequence ?? 0,
        outboxVersion: SYNC_OUTBOX_VERSION,
        syncStartDate,
      };
      await db.setSyncState(targetUrl, state);
    } else if (!state.initialized) {
      state = { ...state, initialized: true, lastSequence: state.lastSequence ?? 0 };
      await db.setSyncState(targetUrl, state);
    }

    if (generation !== syncGeneration) return;
    updateStatus({
      status: "syncing",
      errorMessage: "",
      progressMessage: "Uploading local changes...",
    });
    let uploadedCount = 0;
    await pushPendingChanges(remoteDb, generation, syncStartDate, (count) => {
      uploadedCount += count;
      updateStatus({
        status: "syncing",
        progressMessage: `Processed ${uploadedCount} local changes`,
      });
    });

    let lastSequence = state.lastSequence;
    let downloadedCount = 0;
    while (generation === syncGeneration) {
      updateStatus({
        status: "syncing",
        errorMessage: "",
        progressMessage: `Checking for remote changes${
          downloadedCount ? `: ${downloadedCount} received` : "..."
        }`,
      });
      const changes = await remoteDb.changes({
        since: lastSequence,
        limit: SYNC_BATCH_SIZE,
        include_docs: true,
        style: "all_docs",
        selector: syncSelector(syncStartDate),
      });
      const page = changes.results || [];
      const changedDocs = [];
      for (const change of page) {
        if (generation !== syncGeneration) return;
        if (!change.doc) continue;
        if (!isSyncDocAfterStart(change.doc, syncStartDate)) continue;
        const applied = await db.applyRemoteSyncDoc(change.doc);
        if (applied) {
          changedDocs.push(change.doc);
        } else {
          const localDoc = await db.get(change.doc._id).catch((error) => {
            if (error.status === 404) return null;
            throw error;
          });
          if (localDoc) await db.queueSyncDoc(localDoc);
        }
      }

      if (generation !== syncGeneration) return;
      lastSequence = changes.last_seq;
      await db.setSyncState(targetUrl, {
        ...state,
        initialized: true,
        lastSequence,
      });
      downloadedCount += page.length;
      if (changedDocs.length) dispatchDbChanged(changedDocs);
      if (!page.length || page.length < SYNC_BATCH_SIZE) break;
    }

    if (generation !== syncGeneration) return;
    updateStatus({
      status: "online",
      lastSyncTime: new Date().toISOString(),
      errorMessage: "",
      progressMessage: "",
    });
    retryDelayMs = INITIAL_RETRY_DELAY_MS;
    if (generation === syncGeneration) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        runScheduledAdapterSync(remoteDb, targetUrl, generation, syncStartDate);
      }, POLL_INTERVAL_MS);
    }
  } finally {
    if (syncRunningGeneration === generation) syncRunningGeneration = null;
  }
}

async function pushPendingChanges(remoteDb, generation, syncStartDate, onProgress) {
  while (generation === syncGeneration) {
    const pending = await db.getPendingSyncChanges(SYNC_BATCH_SIZE, syncStartDate);
    if (!pending.length) return;

    updateStatus({
      status: "syncing",
      errorMessage: "",
      progressMessage: `Checking ${pending.length} queued changes...`,
    });
    const remoteRows = await remoteDb.allDocs({
      keys: pending.map((change) => change.id),
      include_docs: true,
    });
    const remoteRowById = new Map(
      (remoteRows.rows || []).map((row) => [row.id, row]),
    );
    const remoteById = new Map(
      (remoteRows.rows || [])
        .filter((row) => row.doc)
        .map((row) => [row.id, row.doc]),
    );
    const toWrite = [];

    for (const change of pending) {
      if (generation !== syncGeneration) return;
      updateStatus({
        status: "syncing",
        progressMessage: `Checking remote record ${change.id}...`,
      });
      const remoteDoc = remoteById.get(change.id);
      const comparison = remoteDoc ? compareSyncDocs(change.doc, remoteDoc) : 1;

      if (remoteDoc && comparison < 0) {
        await db.applyRemoteSyncDoc(remoteDoc);
        await markChangeSynced(change);
      } else if (
        (remoteDoc && comparison === 0) ||
        (!remoteDoc && change.doc._deleted)
      ) {
        await markChangeSynced(change);
      } else {
        const outgoing = { ...change.doc };
        delete outgoing._rev;
        delete outgoing._conflicts;
        const remoteRevision =
          remoteDoc?._rev || remoteRowById.get(change.id)?.value?.rev;
        if (remoteRevision) outgoing._rev = remoteRevision;
        toWrite.push({ change, outgoing });
      }
    }

    const writeResults = toWrite.length
      ? await remoteDb.bulkDocs(toWrite.map(({ outgoing }) => outgoing))
      : [];
    for (let index = 0; index < toWrite.length; index += 1) {
      if (generation !== syncGeneration) return;
      const { change, outgoing } = toWrite[index];
      const result = writeResults[index];
      if (!result) {
        throw new Error(`Sync server returned no result for record ${change.id}.`);
      }
      if (result?.error) {
        if (result.status !== 409 && result.name !== "conflict") {
          const error = new Error(
            result.message || `Failed to sync record ${change.id}.`,
          );
          error.status = result.status;
          error.name = result.name || error.name;
          throw error;
        }
        const latestRemoteDoc = await getRemoteDoc(remoteDb, change.id);
        if (latestRemoteDoc && compareSyncDocs(change.doc, latestRemoteDoc) <= 0) {
          await db.applyRemoteSyncDoc(latestRemoteDoc);
          await markChangeSynced(change);
          continue;
        }
        const latestRevision =
          latestRemoteDoc?._rev || remoteRowById.get(change.id)?.value?.rev;
        if (latestRevision) outgoing._rev = latestRevision;
        await remoteDb.put(outgoing);
      }
      await markChangeSynced(change);
    }
    onProgress(pending.length);
  }
}

function markChangeSynced(change) {
  return db.markSyncChangeSynced(change.id, change.updatedAt);
}

async function getRemoteDoc(remoteDb, id) {
  try {
    return await remoteDb.get(id);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    const revisions = await remoteDb.get(id, { open_revs: "all" }).catch((revisionError) => {
      if (isNotFoundError(revisionError)) return [];
      throw revisionError;
    });
    return revisions.map((result) => result.ok).find(Boolean) || null;
  }
}

function isNotFoundError(error) {
  return (
    Number(error?.status || error?.statusCode) === 404 ||
    error?.name === "not_found" ||
    error?.error === "not_found" ||
    error?.message === "missing" ||
    error?.reason === "missing"
  );
}

function compareSyncDocs(left, right) {
  const leftTime = Date.parse(left?.updatedAt || left?.createdAt || 0) || 0;
  const rightTime = Date.parse(right?.updatedAt || right?.createdAt || 0) || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return stableStringify(left).localeCompare(stableStringify(right));
}

function stableStringify(doc) {
  if (Array.isArray(doc)) return `[${doc.map(stableStringify).join(",")}]`;
  if (doc && typeof doc === "object") {
    const entries = Object.keys(doc)
      .filter((key) => key !== "_rev" && key !== "_conflicts")
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(doc[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(doc);
}

function dispatchDbChanged(docs) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bosco:db-changed", { detail: { docs } }));
}

export async function testConnection(remoteUrl, apiKey) {
  const target = remoteUrl.trim();
  const secret = apiKey.trim();
  if (!target) throw new Error("Please enter a valid remote server URL.");
  if (!secret) throw new Error("Enter the sync server key configured by your administrator.");

  const tempDb = new PouchDB(target, syncOptions(secret));
  try {
    return await tempDb.info();
  } catch (error) {
    throw new Error(error.message || "Unable to reach remote server.");
  } finally {
    await tempDb.close();
  }
}

export async function acknowledgeImportedBaseline(remoteUrl, apiKey) {
  if (usesPouchDb) {
    throw new Error("Baseline setup is only available for SQLite-backed devices.");
  }

  const targetUrl = remoteUrl.trim();
  const secret = apiKey.trim();
  if (!targetUrl) throw new Error("Please enter a valid remote server URL.");
  if (!secret) throw new Error("Enter the sync server key configured by your administrator.");

  const existingState = await db.getSyncState(targetUrl);
  if (existingState) {
    throw new Error("This device has already started syncing with this server.");
  }

  const remoteDb = new PouchDB(targetUrl, syncOptions(secret));
  try {
    const info = await remoteDb.info();
    if (info.update_seq === undefined || info.update_seq === null) {
      throw new Error("The sync server did not provide a replication checkpoint.");
    }
    await db.acknowledgeSyncBaseline(targetUrl, {
      initialized: true,
      lastSequence: info.update_seq,
      outboxVersion: SYNC_OUTBOX_VERSION,
      syncStartDate: getStoredSyncConfig().startDate,
    });
  } finally {
    await remoteDb.close();
  }
}

function syncSelector(startDate) {
  return {
    $or: [
      { updatedAt: { $gte: startDate } },
      { createdAt: { $gte: startDate } },
    ],
  };
}

function isSyncDocAfterStart(doc, startDate) {
  const startTime = Date.parse(startDate);
  if (Number.isNaN(startTime)) return false;
  return [doc?.createdAt, doc?.updatedAt].some((value) => {
    const timestamp = Date.parse(value || "");
    return !Number.isNaN(timestamp) && timestamp >= startTime;
  });
}

const initialConfig = getStoredSyncConfig();
if (initialConfig.enabled && initialConfig.url) {
  startSync(initialConfig.url, initialConfig.apiKey);
}
