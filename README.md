# Invoicing System

Electron desktop app — **Mac and Windows** compatible.

## How this was set up (npm / npx)

This project was initialized the way the [Electron docs](https://www.electronjs.org/docs/latest/tutorial/quick-start) recommend:

1. **npm init** – create the project and `package.json`
2. **npm install --save-dev electron** – add Electron
3. **Electron Forge** – for packaging and building installers on Mac and Windows

Alternative: you can scaffold a **new** app in a different folder with:

```bash
npx create-electron-app@latest my-app-name
```

That creates a new folder with a ready-made Electron + Forge app. Here we used the manual approach in this existing folder.

## Run the app

```bash
npm install
npm start
```

## Using the app

1. **Prices** – Click “Load SKU guide (CSV)” and select your product CSV (e.g. `DshipSKU 2.csv` with columns `id;gtin;title`). Set unit prices in the table and click “Save prices”. Use “Add new SKU” to add products not in the guide (id, title, optional GTIN, price); they are saved in config.
2. **Settings** – Enter company name, address, VAT number, currency, invoice prefix and next number, payment terms, VAT rate, and shipping amount. Click “Save settings”.
3. **Packlist & Invoices** – Click “Load packlist (CSV)” and select a semicolon-delimited CSV with `Name;Tracking;Product;Amount;SKU`. Rows with empty Name and Tracking belong to the previous order. Click “Generate PDF” to create one PDF with a summary page first, then one invoice per order. Invoice numbers auto-increment after each run.

Config is stored in `config/config.json` (prices, custom products, company, tax, shipping, invoice settings). All config can be saved and edited from the UI.

## Build installers (Mac & Windows)

After `npm install`, create distributables with:

```bash
npm run make
```

- **macOS**: `out/make/zip/darwin/` (e.g. `invoicing-system-darwin-x64-1.0.0.zip`)
- **Windows**: `out/make/squirrel.windows/` (Squirrel installer)

Electron is cross-platform: the same code runs on Mac, Windows, and Linux. Forge’s makers produce platform-specific installers from one codebase.
