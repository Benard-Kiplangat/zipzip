# Imara Autospares POS — Multi-Device Online Sync Server (Without CouchDB)

This is a lightweight Node.js Express sync server powered by `express-pouchdb`. It allows all POS devices (desktops, laptops, phones, tablets) to sync sales, stock, and customer data in real-time over the internet or local Wi-Fi without needing a CouchDB database server.

---

## 🚀 Free Deployment Guide

### Option A: Deploy on Render.com (Recommended - Free)

1. Create a free account at [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository or upload the `server/` directory.
4. Set the following build settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Create Web Service**.
6. Once deployed, copy your URL (e.g. `https://imara-pos-sync.onrender.com`).
7. In your POS app, open **📡 Online Sync**, enter `https://imara-pos-sync.onrender.com/db/posdb`, and enable live sync!

---

### Option B: Deploy on Railway.app

1. Go to [Railway.app](https://railway.app) and create a new project.
2. Select **Deploy from GitHub repo** and point to the `server` directory.
3. Railway automatically detects `npm start` and deploys your sync server.
4. Copy the generated domain URL and add `/db/posdb` in your POS Sync Settings.

---

### Option C: Run on Local Wi-Fi (No Internet Required)

Run the server on a central desktop in the shop:

```bash
cd server
npm install
npm start
```

Other devices on the shop Wi-Fi enter `http://192.168.1.100:5000/db/posdb` (using the main desktop's local IP address).
