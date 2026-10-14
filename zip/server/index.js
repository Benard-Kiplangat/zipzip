const express = require("express");
const cors = require("cors");
const PouchDB = require("pouchdb");
const expressPouchDB = require("express-pouchdb");
const { timingSafeEqual } = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const syncDbRoot = path.resolve(
  process.env.SYNC_DB_DIR || path.join(__dirname, "data")
);
const businessCodes = [...new Set(
  (process.env.SYNC_BUSINESS_CODES || "xs,yl")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean)
)];

if (!businessCodes.length || businessCodes.some((code) => !/^[a-z0-9][a-z0-9-]{0,31}$/.test(code))) {
  throw new Error("SYNC_BUSINESS_CODES must be a comma-separated list of valid business codes.");
}

// Enable CORS for all client devices
app.use(cors({ origin: true, credentials: true }));

const syncApiKey = process.env.SYNC_API_KEY || "";
const requireSyncApiKey = (req, res, next) => {
  if (!syncApiKey) {
    return res.status(503).json({ error: "Sync server key is not configured." });
  }
  const authorization = req.get("authorization") || "";
  const basicCredentials = authorization.startsWith("Basic ")
    ? Buffer.from(authorization.slice(6), "base64").toString("utf8")
    : "";
  const separator = basicCredentials.indexOf(":");
  const username = separator < 0 ? "" : basicCredentials.slice(0, separator);
  const basicKey = separator < 0 ? "" : basicCredentials.slice(separator + 1);
  const providedKey = req.get("x-sync-key") || (username === "sync" ? basicKey : "");
  const expected = Buffer.from(syncApiKey);
  const provided = Buffer.from(providedKey);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: "Invalid sync server key." });
  }
  next();
};

const pouchOptions = {
    mode: "minimumForPouchDB",
    overrideMode: {
      include: ["routes/fauxton"],
    },
};

for (const businessCode of businessCodes) {
  const businessDbDirectory = path.join(syncDbRoot, businessCode);
  fs.mkdirSync(businessDbDirectory, { recursive: true });

  const BusinessPouchDB = PouchDB.defaults({
    prefix: `${businessDbDirectory}${path.sep}`,
  });

  app.use(`/${businessCode}/db`, requireSyncApiKey);
  app.use(`/${businessCode}/db`, (req, res, next) => {
    if (req.method !== "POST" || !req.path.endsWith("/_changes")) {
      return next();
    }

    express.json({ limit: "1mb" })(req, res, (error) => {
      if (error) return next(error);
      if (req.body?.selector) {
        req.query.selector = req.body.selector;
      }
      next();
    });
  });
  app.use(
    `/${businessCode}/db`,
    expressPouchDB(BusinessPouchDB, pouchOptions)
  );
}

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: syncApiKey ? "online" : "not_configured",
    server: "Imara Auto Spares Multi-Device Sync Server",
    timestamp: new Date().toISOString(),
    businessCodes,
    syncEndpoints: businessCodes.map((code) => `/${code}/db/posdb`),
    syncKeyConfigured: Boolean(syncApiKey),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 POS Multi-Device Sync Server running on port ${PORT}`);
  for (const businessCode of businessCodes) {
    console.log(`📡 ${businessCode.toUpperCase()} sync URL: http://localhost:${PORT}/${businessCode}/db/posdb`);
  }
  if (!syncApiKey) {
    console.error("Set SYNC_API_KEY before enabling sync; database requests are disabled until it is configured.");
  }
});
