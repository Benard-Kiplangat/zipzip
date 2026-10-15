import PouchDB from "pouchdb-browser";
import { db, usesPouchDb } from "../db";

const SYNC_URL_KEY = "bosco_remote_sync_url";
const SYNC_ENABLED_KEY = "bosco_remote_sync_enabled";
const SYNC_API_KEY = "bosco_remote_sync_api_key";
const SYNC_START_DATE_KEY = "bosco_remote_sync_start_date";
const SYNC_DEVICE_ID_KEY = "bosco_remote_sync_device_id";
const POLL_INTERVAL_MS = 30 * 1000;
const INITIAL_RETRY_DELAY_MS = 1 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const SYNC_BATCH_SIZE = 100;
const FEED_VERSION = 1;

let syncTimer = null;
let syncWakeHandler = null;
let runningGeneration = null;
let generation = 0;
let retryDelayMs = INITIAL_RETRY_DELAY_MS;
const statusListeners = new Set();
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
    let deviceId = localStorage.getItem(SYNC_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SYNC_DEVICE_ID_KEY, deviceId);
    }
    return {
      url: localStorage.getItem(SYNC_URL_KEY) || "",
      enabled: localStorage.getItem(SYNC_ENABLED_KEY) === "true",
      apiKey: localStorage.getItem(SYNC_API_KEY) || "",
      startDate: new Date(startDate).toISOString(),
      deviceId,
    };
  } catch (error) {
    console.error("Failed to read sync configuration:", error);
    return {
      url: "",
      enabled: false,
      apiKey: "",
      startDate: new Date().toISOString(),
      deviceId: `device-${Date.now()}`,
    };
  }
}

export function saveSyncConfig(url, enabled, apiKey = "", startDate) {
  try {
    const timestamp = Date.parse(startDate || getStoredSyncConfig().startDate);
    if (Number.isNaN(timestamp)) throw new Error("Enter a valid sync start date.");
    localStorage.setItem(SYNC_URL_KEY, url.trim());
    localStorage.setItem(SYNC_ENABLED_KEY, enabled ? "true" : "false");
    localStorage.setItem(SYNC_API_KEY, apiKey.trim());
    localStorage.setItem(SYNC_START_DATE_KEY, new Date(timestamp).toISOString());
  } catch (error) {
    updateStatus({
      status: "error",
      errorMessage: "Unable to save sync settings on this device.",
    });
    throw error;
  }
  if (enabled) startSync(url.trim(), apiKey.trim());
  else stopSync();
}

function updateStatus(patch) {
  currentStatus = { ...currentStatus, ...patch };
  statusListeners.forEach((listener) => listener(currentStatus));
}

export function subscribeSyncStatus(listener) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

export function stopSync() {
  generation += 1;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (syncWakeHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", syncWakeHandler);
    window.removeEventListener("online", syncWakeHandler);
  }
  syncWakeHandler = null;
  retryDelayMs = INITIAL_RETRY_DELAY_MS;
  updateStatus({ status: "idle", errorMessage: "", progressMessage: "" });
}

export function startSync(urlOverride, apiKeyOverride) {
  stopSync();
  const thisGeneration = generation;
  const config = getStoredSyncConfig();
  const url = (urlOverride === undefined ? config.url : urlOverride || "").trim();
  const apiKey = (apiKeyOverride === undefined ? config.apiKey : apiKeyOverride || "").trim();
  if (!url || !apiKey) {
    updateStatus({
      status: "error",
      errorMessage: !url
        ? "No remote sync server URL configured."
        : "Enter the sync server key configured by your administrator.",
    });
    return;
  }

  const endpoint = getChangeFeedUrl(url);
  const run = () => runSync(endpoint, url, apiKey, config, thisGeneration);
  if (typeof document !== "undefined") {
    syncWakeHandler = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", syncWakeHandler);
    window.addEventListener("online", run);
  }
  run();
}

function getChangeFeedUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (/\/db\/[^/]+$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/db\/[^/]+$/i, "/sync/changes");
  } else {
    url.pathname = `${url.pathname}/sync/changes`.replace(/\/{2,}/g, "/");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function requestJson(endpoint, apiKey, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${btoa(`sync:${apiKey}`)}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const body = await response.text();
    let data;
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      const error = new Error(
        `Sync server returned a non-JSON response (HTTP ${response.status}).`,
      );
      error.status = response.status;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data.message || data.error || `Sync server returned HTTP ${response.status}.`);
      error.status = response.status;
      error.code = data.error;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Sync request timed out. The device will retry automatically.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runSync(endpoint, targetUrl, apiKey, config, thisGeneration) {
  if (runningGeneration === thisGeneration || thisGeneration !== generation) return;
  runningGeneration = thisGeneration;
  updateStatus({
    status: "syncing",
    errorMessage: "",
    progressMessage: "Connecting to the JSON change feed...",
  });

  try {
    let state = await db.getSyncState(targetUrl);
    if (!state || state.feedVersion !== FEED_VERSION) {
      updateStatus({
        status: "syncing",
        progressMessage: "Starting from the server's current change-feed position...",
      });
      const latest = await requestJson(
        `${endpoint}?since=latest`,
        apiKey,
      );
      state = {
        feedVersion: FEED_VERSION,
        syncStartDate: config.startDate,
        remoteCursor: Math.max(
          latest.purgedThrough || 0,
          (latest.oldestSeq || latest.nextCursor + 1) - 1,
        ),
        localSequence: 0,
      };
      if (!usesPouchDb) await db.seedSyncChanges(config.startDate);
      await db.setSyncState(targetUrl, state);
    } else if (state.syncStartDate !== config.startDate) {
      if (!usesPouchDb) await db.seedSyncChanges(config.startDate);
      state.syncStartDate = config.startDate;
      if (usesPouchDb) state.localSequence = 0;
      await db.setSyncState(targetUrl, state);
    }

    await uploadLocalChanges(endpoint, targetUrl, apiKey, config, state, thisGeneration);
    if (thisGeneration !== generation) return;
    await downloadRemoteChanges(endpoint, targetUrl, apiKey, config, state, thisGeneration);
    if (thisGeneration !== generation) return;

    retryDelayMs = INITIAL_RETRY_DELAY_MS;
    updateStatus({
      status: "online",
      lastSyncTime: new Date().toISOString(),
      errorMessage: "",
      progressMessage: "",
    });
    scheduleSync(POLL_INTERVAL_MS, () =>
      runSync(endpoint, targetUrl, apiKey, config, thisGeneration),
    );
  } catch (error) {
    if (thisGeneration !== generation) return;
    console.error("JSON change-feed sync failed:", error);
    if (error.status === 410) {
      updateStatus({
        status: "error",
        errorMessage:
          error.message ||
          "This device missed the server's 24-hour sync window. Import a current export before reconnecting.",
        progressMessage: "",
      });
      return;
    }
    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    updateStatus({
      status: "offline",
      errorMessage: error.message || "Unable to reach the sync server.",
      progressMessage: `Retrying sync in ${Math.ceil(delay / 1000)} seconds...`,
    });
    scheduleSync(delay, () =>
      runSync(endpoint, targetUrl, apiKey, config, thisGeneration),
    );
  } finally {
    if (runningGeneration === thisGeneration) runningGeneration = null;
  }
}

function scheduleSync(delay, callback) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    callback();
  }, delay);
}

async function uploadLocalChanges(endpoint, targetUrl, apiKey, config, state, thisGeneration) {
  if (usesPouchDb) {
    let sequence = state.localSequence || 0;
    while (thisGeneration === generation) {
      updateStatus({
        status: "syncing",
        progressMessage: "Checking local changes...",
      });
      const batch = await db.getLocalChangesSince(sequence, SYNC_BATCH_SIZE);
      console.log(`Uploading ${batch.results.length} local changes since seq ${sequence}...`);
      const changes = (batch.results || [])
        .filter((change) => change.doc && isAfterStart(change.doc, config.startDate))
        .map((change) => ({ id: change.id, doc: stripRevision(change.doc) }));
      if (changes.length) {
        await appendChanges(endpoint, apiKey, config.deviceId, changes);
      }
      sequence = batch.last_seq;
      state.localSequence = sequence;
      await db.setSyncState(targetUrl, state);
      if (!batch.results?.length || batch.results.length < SYNC_BATCH_SIZE) return;
    }
    return;
  }

  while (thisGeneration === generation) {
    const pending = await db.getPendingSyncChanges(SYNC_BATCH_SIZE, config.startDate);
    if (!pending.length) return;
    updateStatus({
      status: "syncing",
      progressMessage: `Uploading ${pending.length} local changes...`,
    });
    await appendChanges(
      endpoint,
      apiKey,
      config.deviceId,
      pending.map(({ id, doc }) => ({ id, doc: stripRevision(doc) })),
    );
    for (const change of pending) {
      await db.markSyncChangeSynced(change.id, change.updatedAt);
    }
  }
}

async function appendChanges(endpoint, apiKey, deviceId, changes) {
  await requestJson(endpoint, apiKey, {
    method: "POST",
    body: JSON.stringify({ deviceId, changes }),
  });
}

async function downloadRemoteChanges(endpoint, targetUrl, apiKey, config, state, thisGeneration) {
  while (thisGeneration === generation) {
    updateStatus({
      status: "syncing",
      progressMessage: "Checking for remote changes...",
    });
    const page = await requestJson(
      `${endpoint}?since=${encodeURIComponent(state.remoteCursor || 0)}&limit=${SYNC_BATCH_SIZE}`,
      apiKey,
    );

    const changedDocs = [];
    for (const change of page.changes || []) {
      if (thisGeneration !== generation) return;
      if (change.deviceId === config.deviceId) continue;
      if (!isAfterStart(change.doc, config.startDate)) continue;
      updateStatus({
        status: "syncing",
        progressMessage: `Applying remote change ${change.id}...`,
      });
      const applied = await db.applyRemoteSyncDoc(change.doc);
      if (applied) changedDocs.push(change.doc);
    }
    state.remoteCursor = page.nextCursor;
    await db.setSyncState(targetUrl, state);
    if (changedDocs.length) dispatchDbChanged(changedDocs);
    if (!(page.changes || []).length || page.changes.length < SYNC_BATCH_SIZE) return;
  }
}

function isAfterStart(doc, startDate) {
  const start = Date.parse(startDate);
  if (!doc || Number.isNaN(start)) return false;
  return [doc.createdAt, doc.updatedAt].some((value) => {
    const time = Date.parse(value || "");
    return !Number.isNaN(time) && time >= start;
  });
}

function stripRevision(doc) {
  const copy = { ...doc };
  delete copy._rev;
  delete copy._revisions;
  delete copy._conflicts;
  return copy;
}

function dispatchDbChanged(docs) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bosco:db-changed", { detail: { docs } }));
}

export async function testConnection(remoteUrl, apiKey) {
  const targetUrl = remoteUrl.trim();
  const secret = apiKey.trim();
  if (!targetUrl) throw new Error("Please enter a valid remote server URL.");
  if (!secret) throw new Error("Enter the sync server key configured by your administrator.");
  const endpoint = getChangeFeedUrl(targetUrl);
  const result = await requestJson(`${endpoint}?since=latest&limit=1`, secret);
  return { db_name: "JSON change feed", update_seq: result.latestSeq };
}

export async function acknowledgeImportedBaseline(remoteUrl, apiKey) {
  if (usesPouchDb) {
    throw new Error("Baseline acknowledgement is only available for SQLite-backed devices.");
  }
  const targetUrl = remoteUrl.trim();
  const endpoint = getChangeFeedUrl(targetUrl);
  const latest = await requestJson(
    `${endpoint}?since=latest`,
    apiKey.trim(),
  );
  const existing = await db.getSyncState(targetUrl);
  if (existing) throw new Error("This device has already started syncing with this server.");
  await db.acknowledgeSyncBaseline(targetUrl, {
    feedVersion: FEED_VERSION,
    syncStartDate: getStoredSyncConfig().startDate,
    remoteCursor: latest.nextCursor,
    localSequence: 0,
  });
}

const initialConfig = getStoredSyncConfig();
if (initialConfig.enabled && initialConfig.url) {
  startSync(initialConfig.url, initialConfig.apiKey);
}
