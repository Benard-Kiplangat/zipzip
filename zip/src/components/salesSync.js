import { db } from "../db";

const DEVICE_ID_KEY = "bosco_001";
const SYNC_CURSOR_KEY = "bosco_sales_sync_cursor";

// Configure this to your deployed Supabase Edge Function.
const SYNC_API_URL = "";
const SYNC_API_KEY = "";

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
async function uploadSales(deviceId, queuedDocs) {
  if (!queuedDocs.length) {
    return { uploaded: 0 };
  }

  const sales = queuedDocs.filter((doc) => doc.type === "sale");
  const products = queuedDocs.filter((doc) => doc.type === "product");
  const customers = queuedDocs.filter((doc) => doc.type === "customer");
  const users = queuedDocs.filter((doc) => doc.type === "user");

  /* console.log(sales);
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
async function importSales(docs) {
  if (!docs.length) {
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const item of docs) {
    const doc = item.saleData;

    if (!doc || !doc._id) {
      skipped++;
      continue;
    }

    // Strip PouchDB revision metadata before inserting.
    const newSale = { ...doc, _id: doc._id.slice(1) };
    delete newSale._rev;

    try {
      // Check for duplicates before changing stock so retries are idempotent.
      try {
        await db.get(newSale._id);
        skipped++;
        continue;
      } catch (error) {
        if (error.status !== 404 && error.name !== "not_found") {
          console.log(error);
        }
      }

      if (newSale.type === "sale") {
        if (newSale.productId) {
          try {
            const product = await db.get(newSale.productId);
            await db.put({
              ...product,
              stock: (Number(product.stock) || 0) - (Number(newSale.quantity) || 0),
            });
          } catch (error) {
            console.log(error);
            // Keep the sale even if its product is not present locally.
          }
        }
        await db.put(newSale);
        inserted++;
      } else if (newSale.type === "product") {
        let product;
        if (newSale.productId) {
          try {
            product = await db.get(newSale.productId);
          } catch (error) {
            if (error.status !== 404 && error.name !== "not_found") {
              console.log(error);
            }
          }
        }

        if (product) {
          await db.put({
            ...product,
            stock: (Number(product.stock) || 0) + (Number(newSale.stock) || 0),
          });
        } else {
          await db.put(newSale);
        }
        inserted++;
      } else {
        await db.put(newSale);
        inserted++
      }
    } catch (error) {
      // Another sync or local process may have inserted it already.
      console.error("Could not import sale:", doc._id, error);
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
export async function syncSales({ onProgress } = {}) {
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
    report("Initializing device...");

    const initDevice = await apiRequest("initialize", {
      deviceId,
    });


    if (!initDevice.success) {
      throw new Error(
        initDevice.error || "Device initialization failed"
      );
    }

    // Initial baseline.

    report("baseline", "Establishing initial synchronization baseline...");

    const baseline = await apiRequest("baseline", { deviceId });

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

  const uploadResult = await uploadSales(deviceId, localDocs);

  report("uploaded", "Local sales uploaded successfully.", {
    total: localDocs.length,
    uploaded: uploadResult.uploaded,
  });

  // Step 2: Download new sales.
  report("downloading", "Checking for sales from other terminals...");

  const cursor = getCursor();
  const downloadResult = await downloadSales(deviceId, cursor);
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
    uploaded: uploadResult.uploaded,
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
