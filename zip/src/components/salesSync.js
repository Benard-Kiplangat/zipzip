// salesSync.js
import { db } from "../db";

const DEVICE_ID_KEY = "bosco_device_id";
const SYNC_CURSOR_KEY = "bosco_sales_sync_cursor";

// Configure this to your deployed Supabase Edge Function.
const SYNC_API_URL = import.meta.env.VITE_SUPABASE_SYNC_URL;
const SYNC_API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

function getCursor() {
  return Number(localStorage.getItem(SYNC_CURSOR_KEY) || 0);
}

function saveCursor(sequenceId) {
  localStorage.setItem(SYNC_CURSOR_KEY, String(sequenceId));
}

async function apiRequest(action, body) {
  if (!SYNC_API_URL || !SYNC_API_KEY) {
    throw new Error("Sales sync API is not configured.");
  }

  const response = await fetch(SYNC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SYNC_API_KEY,
      Authorization: `Bearer ${SYNC_API_KEY}`,
    },
    body: JSON.stringify({
      action,
      ...body,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Sync request failed (${response.status}).`);
  }

  return result;
}

async function getLocalSales() {
  const result = await db.allDocs({
    include_docs: true,
  });

  return result.rows
    .map((row) => row.doc)
    .filter((doc) => doc && doc.type === "sale" && doc._id);
}

/**
 * Upload local sales that the server has not seen before.
 *
 * The server must enforce uniqueness on sale_id so retrying an
 * upload cannot create a duplicate.
 */
async function uploadSales(deviceId, sales) {
  if (!sales.length) {
    return { uploaded: 0 };
  }

  const result = await apiRequest("upload", {
    deviceId,
    sales: sales.map((sale) => ({
      saleId: sale._id,
      saleData: sale,
    })),
  });

  return {
    uploaded: result.accepted ?? 0,
    alreadyExisted: result.duplicates ?? 0,
  };
}

/**
 * Download sales from other devices after our saved cursor.
 */
async function downloadSales(deviceId, cursor) {
  return apiRequest("download", {
    deviceId,
    afterSequenceId: cursor,
    limit: 500,
  });
}

/**
 * Insert incoming sales only if they do not already exist locally.
 *
 * IMPORTANT:
 * This function deliberately does not deduct stock.
 * We will add the stock effect for newly downloaded sales separately.
 */
async function importSales(sales) {
  if (!sales.length) {
    return { inserted: 0, skipped: 0 };
  }

  const existing = await db.allDocs({
    include_docs: true,
  });

  const existingIds = new Set(
    existing.rows
      .filter((row) => row.doc)
      .map((row) => row.id)
  );

  let inserted = 0;
  let skipped = 0;

  for (const item of sales) {
    const sale = item.saleData;

    if (!sale || sale.type !== "sale" || !sale._id) {
      skipped++;
      continue;
    }

    if (existingIds.has(sale._id)) {
      skipped++;
      continue;
    }

    // Strip PouchDB revision metadata before inserting.
    const newSale = { ...sale };
    delete newSale._rev;

    try {
      await db.put(newSale);
      existingIds.add(sale._id);
      inserted++;
    } catch (error) {
      // Another sync or local process may have inserted it already.
      console.error("Could not import sale:", sale._id, error);
      throw error;
    }
  }

  if (inserted > 0) {
    window.dispatchEvent(new CustomEvent("bosco:db-changed"));
  }

  return { inserted, skipped };
}

/**
 * Synchronize sales.
 *
 * First run:
 * - Upload all existing local sales.
 * - Do not download historical sales.
 * - Establish the initial server cursor.
 *
 * Later runs:
 * - Upload local sales.
 * - Download sales from other devices.
 * - Insert missing sales.
 * - Advance the cursor after successful import.
 */
export async function syncSales() {
  const deviceId = getDeviceId();
  const isFirstSync = localStorage.getItem(SYNC_CURSOR_KEY) === null;

  // Step 1: Upload local sales. Safe to retry because sale IDs are unique.
  const localSales = await getLocalSales();
  const uploadResult = await uploadSales(deviceId, localSales);

  // Step 2: On first sync, establish a baseline without replaying
  // historical stock deductions.
  if (isFirstSync) {
    const baseline = await apiRequest("baseline", { deviceId });

    saveCursor(baseline.latestSequenceId ?? 0);

    return {
      deviceId,
      firstSync: true,
      localSales: localSales.length,
      ...uploadResult,
      downloaded: 0,
      inserted: 0,
      message: "Initial sales baseline established.",
    };
  }

  // Step 3: Download one page of new sales.
  const cursor = getCursor();
  const downloadResult = await downloadSales(deviceId, cursor);

  const sales = downloadResult.sales || [];

  // Step 4: Import before advancing the cursor.
  const importResult = await importSales(sales);

  // The server must return the highest sequence ID examined,
  // including records excluded because they belong to this device.
  const nextCursor = downloadResult.nextCursor;

  if (nextCursor !== undefined && nextCursor !== null) {
    saveCursor(nextCursor);
  }

  return {
    deviceId,
    firstSync: false,
    localSales: localSales.length,
    ...uploadResult,
    downloaded: sales.length,
    ...importResult,
    cursor: getCursor(),
    hasMore: Boolean(downloadResult.hasMore),
  };
}
