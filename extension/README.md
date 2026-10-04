# Viper Local Extractor (Residential IP Fallback Extension)

A lightweight browser extension that routes image extraction requests (e.g. `vipr.im`, `postimg.cc`, `imgbox.com`) through your local home network (Residential IP) when cloud hosts like **Render**, AWS, or DigitalOcean are blocked by datacenter IP filters.

---

## 🚀 How to Install in Chrome / Brave / Edge / Firefox

1. Open your browser and navigate to the Extensions management page:
   - **Chrome / Brave**: `chrome://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click the **"Load unpacked"** button.
4. Select the `extension/` folder inside this project directory (`dev/v2/extension`).
5. (Recommended) Click the puzzle piece icon in your browser toolbar and **pin** "Viper Local Extractor".

---

## ⚡ How to Use

### Workflow 1: One-Click inside the Viper Web App
1. When you run an extraction on your deployed Render web app and image hosts like `vipr.im` fail due to cloud IP blocks, the modal will display:
   - `↻ Re-extract (N)`
   - `⚡ Local Fallback (N)`
2. Click **⚡ Local Fallback**.
3. The web app communicates directly with the extension:
   - The extension fetches the `vipr.im` URLs from your local residential internet connection.
   - Extracts the direct full-resolution image URLs.
   - Posts the resolved direct links back to Render.
   - Render consolidates the links, generates the Pastebin URL, updates history, and updates your UI in seconds!

### Workflow 2: Via the Extension Popup
1. With your Viper web app tab open (showing failed/blocked links), click the **Viper Local Extractor** extension icon in your browser toolbar.
2. The popup detects the open modal and displays:
   - `⚠️ X blocked links detected on current page`
3. Click **⚡ Resolve Blocked Links on Page**.
4. The extension resolves the links and instructs the Viper tab to complete the extraction.

### Workflow 3: Standalone URL Extractor
1. Open the extension popup.
2. Paste any list of URLs (one per line) into the **Manual URL Extractor** box.
3. Click **Extract with Local Internet**.
4. Click **Copy All Direct Links**.
