import { db } from "../db";
import { useBusinessConfig } from "../config";

const DEVICE_ID_KEY = "bosco_001";
const BUSINESS_CODE = "bosco_bcode";
const SYNC_CURSOR_KEY = "bosco_sales_sync_cursor";

// Configure this to your deployed Supabase Edge Function.
const SYNC_API_URL = "ggg";
const SYNC_API_KEY = "dff";

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

  const salesDocs = await db.allDocs({
    include_docs: true,
    startkey: "q",
    endkey: "q\uffff",
  });

  return salesDocs.rows
    .map((row) => row.doc)
    .filter((doc) => doc && doc._id);
}

/**
 * Upload local sales that the server has not seen before.
 *
 * The server must enforce uniqueness on sale_id so retrying an
 * upload cannot create a duplicate.
 */
async function uploadSales(deviceId, queuedDocs, bCode) {
  if (!queuedDocs.length) {
    return { uploaded: 0 };
  }

/*
  const sales = queuedDocs.filter((doc) => doc.type === "sale");
  const products = queuedDocs.filter((doc) => doc.type === "product");
  const customers = queuedDocs.filter((doc) => doc.type === "customer");
  const users = queuedDocs.filter((doc) => doc.type === "user");

 console.log(sales);
   console.log(products);
   console.log(customers);
   console.log(users);
   */

  const saleData = queuedDocs.map((doc) => ({
    saleId: doc._id,
    saleData: doc,
  }));

  const uploadResult = await apiRequest("upload", {
    deviceId,
    saleData,
    bCode,
  });

  if (!uploadResult.accepted) {
    throw new Error(uploadResult.error || "Upload failed");
  } else {
    queuedDocs.forEach(doc => {
      db.remove(doc).catch((error) => {
        console.error("Could not delete queued docs:", doc._id, error);
      });
    });
  }
  return {
    uploaded: uploadResult.accepted ?? 0,
    alreadyExisted: uploadResult.duplicates ?? 0,
  };
}

/**
 * Download sales from other devices after our saved cursor.
 */
async function downloadSales(deviceId, cursor, bCode) {
  return apiRequest("download", {
    deviceId,
    afterSequenceId: cursor,
    limit: 500,
    bCode,
  });
}

/**
 * Insert incoming sales only if they do not already exist locally.
 *
 * IMPORTANT:
 * This function deliberately does not deduct stock.
 * We will add the stock effect for newly downloaded sales separately.
 */


const isNotFoundError = (error) =>
  error.status === 404 ||
  error.name === "not_found" ||
  error.name === "missing";

async function getDocOrNull(id) {
  try {
    return await db.get(id);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

// Update product information without overwriting locally calculated stock.
async function importProduct(doc) {
  const existing = await getDocOrNull(doc._id);

  if (!existing) {
    await db.put(doc);
    return;
  }

  await db.put({
    ...existing,
    ...doc,
    _id: existing._id,
    _rev: existing._rev,
    stock: existing.stock,
  });
}

async function updateProductStock(productId, quantity) {
  const product = await getDocOrNull(productId);

  if (!product) {
    return false;
  }

  await db.put({
    ...product,
    stock: Math.max(
      0,
      (Number(product.stock) || 0) + quantity
    ),
  });

  return true;
}

function normalizeImportedDoc(item) {
  const doc = item?.saleData;

  if (!doc?._id || typeof doc._id !== "string") {
    return null;
  }

  const normalized = {
    ...doc,
    _id: doc._id.slice(1),
  };

  delete normalized._rev;

  return normalized;
}

async function importSales(docs) {
  const result = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    missingProducts: 0,
    errors: [],
  };

  if (!Array.isArray(docs) || !docs.length) {
    return result;
  }

  for (const item of docs) {
    let doc;

    try {
      doc = normalizeImportedDoc(item);

      if (!doc) {
        result.skipped++;
        continue;
      }

      // Product additions use the product ID as _id,
      // so they require a separate movement ID for deduplication.
      if (doc.type === "productAdd") {

        const quantity = Number(doc.qty ?? doc.quantity ?? doc.stock) || 0;
        if (quantity <= 0) {
          result.skipped++;
          continue;
        }

        const updated = await updateProductStock(doc._id, quantity);

        if (!updated) {
          throw new Error(`Product not found: ${doc._id}`);
        }
        result.inserted++;
        continue;
      }

      // Check duplicates for ordinary documents.
      if (await getDocOrNull(doc._id)) {
        result.skipped++;
        continue;
      }

      switch (doc.type) {
        case "sale": {
          const quantity = Number(doc.quantity ?? doc.qty) || 0;

          if (doc.productId) {
            const updated = await updateProductStock(
              doc.productId,
              -quantity
            );

            if (!updated) {
              result.missingProducts++;
              console.warn("Product missing during sale import:", doc.productId);
            }
          }

          await db.put(doc);
          result.inserted++;
          break;
        }

        case "product": {
          await importProduct(doc);
          result.inserted++;
          break;
        }

        default:
          result.skipped++;
          console.warn("Unknown document type:", doc.type);
      }
    } catch (error) {
      // Record the error and continue with the next document.
      result.failed++;

      result.errors.push({
        id: doc?._id || item?.saleData?._id || "unknown",
        message: error.message,
      });

      console.error("Import failed:", doc?._id, error);
    }
  }

  if (result.inserted > 0) {
    window.dispatchEvent(new CustomEvent("bosco:db-changed"));
  }

  return result;
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
export async function syncSales({ onProgress, bCode } = {}) {
  const report = (stage, message, details = {}) => {
    onProgress?.({
      stage,
      message,
      ...details,
    });
  };

  report("starting", "Preparing synchronization...");

  const deviceId = getDeviceId();
  const isFirstSync = localStorage.getItem(SYNC_CURSOR_KEY) === null;

  if (isFirstSync) {
    report("Initializing device...", "Setting up your new device...");

    const initDevice = await apiRequest("initialize", {
      deviceId,
      bCode,
    });


    if (!initDevice.success) {
      throw new Error(
        initDevice.error || "Device initialization failed"
      );
    }

    // Initial baseline.

    report("baseline", "Establishing initial synchronization baseline...");

    const baseline = await apiRequest("baseline", { deviceId, bCode });

    if (!baseline.success) {
      throw new Error(
        initDevice.error || "Baseline failed"
      );
    }
    saveCursor(baseline.latestSequenceId ?? 0);

    report("complete", "Initial synchronization completed.");

    return {
      deviceId,
      firstSync: true,
      downloaded: 0,
      inserted: 0,
      message: "Initial sales baseline established.",
    };
  }

  // Step 1: Upload local sales.
  report("reading", "Reading local sales...");

  const localDocs = await getLocalSales();

  report("uploading", `Uploading ${localDocs.length} local sales...`, {
    total: localDocs.length,
  });

  const uploadResult = await uploadSales(deviceId, localDocs, bCode);

  report("uploaded", "Local sales uploaded successfully.", {
    total: localDocs.length,
    uploaded: uploadResult.uploaded,
  });

  // Step 2: Download new sales.
  report("downloading", "Checking for sales from other terminals...");

  const cursor = getCursor();
  const downloadResult = await downloadSales(deviceId, cursor, bCode);
  const sales = downloadResult.sales || [];

  report("importing", `Importing ${sales.length} received sales...`, {
    total: sales.length,
  });

  // Step 3: Import.
  const importResult = await importSales(sales);

  // Step 4: Advance the cursor after a successful import.
  const nextCursor = downloadResult.nextCursor;

  if (nextCursor !== undefined && nextCursor !== null) {
    saveCursor(nextCursor);
  }

  report("complete", "Sales synchronization completed.", {
    uploaded: localDocs.length,
    downloaded: sales.length,
    inserted: importResult.inserted,
  });

  return {
    deviceId,
    firstSync: false,
    localSales: localDocs.length,
    ...uploadResult,
    downloaded: sales.length,
    ...importResult,
    cursor: getCursor(),
    hasMore: Boolean(downloadResult.hasMore),
  };
}
