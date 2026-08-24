const express = require("express");
const cors = require("cors");
const PouchDB = require("pouchdb");
const expressPouchDB = require("express-pouchdb");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all client devices
app.use(cors({ origin: true, credentials: true }));

// Configure In-Memory / File-based PouchDB Server
const InMemPouchDB = PouchDB.defaults({
  prefix: "./data/",
});

// Attach express-pouchdb middleware at /db
app.use(
  "/db",
  expressPouchDB(InMemPouchDB, {
    mode: "minimumForPouchDB",
    overrideMode: {
      include: ["routes/fauxton"],
    },
  })
);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "online",
    server: "Mogogosiek Auto Spares Multi-Device Sync Server",
    timestamp: new Date().toISOString(),
    syncEndpoint: "/db/posdb",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 POS Multi-Device Sync Server running on port ${PORT}`);
  console.log(`📡 Remote Sync URL: http://localhost:${PORT}/db/posdb`);
});
