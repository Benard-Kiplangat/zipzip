# Imara Autospares POS — Multi-Device Online Sync Server

This is a lightweight Node.js Express server. Each business code has its own separate PouchDB database and JSON change-feed file.

## Deploy on Render

1. Push this repository to GitHub, then in Render choose **New + → Web Service** and connect the repository.
2. Set **Root Directory** to `zip/server`, **Build Command** to `npm install`, and **Start Command** to `npm start`.
3. Add these environment variables:
   - `SYNC_API_KEY`: a long, randomly generated secret. Keep it private and enter the same key on authorized POS devices.
   - `SYNC_BUSINESS_CODES`: comma-separated lower-case business codes, for example `xs,yl`. These codes determine the URL routes and are allow-listed by the server.
   - `SYNC_DB_DIR`: `/var/data`.
4. Add a **persistent disk** to the service with mount path `/var/data`. PouchDB creates a separate subdirectory per business code, such as `/var/data/xs` and `/var/data/yl`. Without persistent storage, database data may be lost when the service restarts or is redeployed. Persistent disks may require a paid Render plan.
5. Deploy the service and wait for the deploy to finish. Open the service URL (for example, `https://imara-pos-sync.onrender.com/`); the response should report `"status":"online"` and list each configured sync endpoint.
6. In each POS installation's **Online Sync** settings, use the matching URL and the `SYNC_API_KEY`:
   - XS: `https://imara-pos-sync.onrender.com/xs/db/posdb`
   - YL: `https://imara-pos-sync.onrender.com/yl/db/posdb`
   Test the connection and enable sync.

The configured business code must match the code for that business. If adding another business later, update `SYNC_BUSINESS_CODES` and redeploy. Do not use the same code for separate businesses: they would share one database.

### Optional custom domain

You can use a subdomain such as `sync.example.com` while Render continues to run the service and store the data. Add the domain under the Render service's **Settings → Custom Domains**, then create the DNS record Render requests in your domain provider's DNS/Zone Editor. After Render verifies the record and HTTPS is active, replace the Render host in the app URL, for example `https://sync.example.com/xs/db/posdb`.

## Deploy on Railway

1. Create a Railway project from this repository and point it at the `server` directory.
2. Attach a persistent volume and configure `SYNC_DB_DIR` to its mount path.
3. Configure `SYNC_API_KEY` and `SYNC_BUSINESS_CODES` (for example `xs,yl`) in the service's variables, then deploy.
4. In the POS app's **Online Sync** settings, enter the generated domain URL with the business-specific route, such as `/xs/db/posdb`, and the configured key.

## Run on local Wi-Fi

Run the server on a central desktop in the shop. In PowerShell:

```powershell
cd server
npm install
$env:SYNC_API_KEY = "replace-with-a-long-random-secret"
$env:SYNC_BUSINESS_CODES = "xs,yl"
npm start
```

Other devices on the shop Wi-Fi enter the endpoint for their business, such as `http://192.168.1.100:5000/xs/db/posdb` (using the desktop's local IP address) and the same key.

## Sync behavior and connecting another app

- Reads and writes in the POS continue to use the device's local database. The sync server is not used as a live database for checkout or other operations.
- All clients poll `/<business-code>/sync/changes` every 30 seconds and upload/download JSON document changes.
- The server retains the latest change per document for 24 hours. Daily cleanup occurs when the feed is queried or appended. Devices resume from a persisted server cursor. If the cursor predates the retained window, the server returns HTTP 410; import a current export and use **Use Imported Baseline** before resuming sync.
- The device's saved **Sync changes from** date filters what it uploads. It defaults to the time sync settings are first opened and can be changed in those settings. The import/export backup format and its merge behavior are separate from sync.
- The JSON feed is the sync transport. The PouchDB database endpoint remains available for existing integrations, but app clients no longer replicate through it.
- Concurrent SQLite edits to the same record use `updatedAt` as a last-write-wins timestamp. Prefer application-level conflict handling for data that must merge (for example, stock counts); sync is not a substitute for that.
- The server exposes the JSON change feed at `/<business-code>/sync/changes` and the PouchDB/CouchDB API at `/<business-code>/db/posdb`. Feed requests use HTTP Basic authentication (username `sync`, password `SYNC_API_KEY`) or the `x-sync-key` header. Business codes not listed in `SYNC_BUSINESS_CODES` are not mounted. Requests to configured sync routes are rejected until `SYNC_API_KEY` is configured; `/` remains a health-check endpoint.
- Use HTTPS when syncing over the public internet. The shared key grants access to all data in this sync database, so keep it private and rotate it if exposed.
- `SYNC_API_KEY` is shared across configured business routes, so every authorized device can technically access each configured business endpoint. Use only with trusted devices. Separate per-business credentials would require a future server/client change.
- The server stores PouchDB files under `server/data/<business-code>` by default. Set `SYNC_DB_DIR` to a persistent volume mount point for hosted deployments.
