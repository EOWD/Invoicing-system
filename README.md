# Invoicing System

Electron desktop app for building product catalogs, packlists, and PDF invoices. **Mac and Windows** compatible.

**Created by Eiad Oraby.**

## Run the app

```bash
npm install
npm start
```

On first launch you’ll see an **unlock screen**. Enter the access code (default: `babybest`) to open the app. The code is stored as a hash in config; no plain password is saved.

## Using the app

### Prices (product catalog)

- **Load SKU guide (CSV)** – Select a semicolon-delimited CSV. Expected columns: `id`, `gtin`, `title`, and optionally `batch`, `price`, `bbd`, `articleNo` (7th column). Loaded products appear in the table with optional batch, BBD, and article number.
- **Search** – Filter the catalog by ID, title, GTIN, batch, BBD, or article number.
- **Edit in table** – Set or change GTIN, batch, BBD, article no, in-stock, and unit price per product. Uncheck “In stock” to exclude a line from generated invoices.
- **Add new product** – Use “Add new product to catalog” to add SKUs not in the guide (ID, title, GTIN, batch, BBD, article no, unit price). Custom products are stored in config.
- **Save prices** – Writes all table data and custom products to config. A **Saving…** overlay appears while the app is saving.

Config (prices, custom products, in-stock flags) is stored in `config/config.json`. When the app is packaged, config is read/written from the app’s user data directory so it works on other machines.

### Settings

- **Company (sender)** – Name, address, VAT, company code, phone, email, CEO, website, logo path, bank details. You can add multiple sender profiles and choose the active one.
- **Receiver** – One or more receiver profiles (name, address, VAT) for invoices.
- **Invoice** – Currency, prefix, next number, save directory, payment/delivery terms, footer text.
- **Tax** – VAT rate and whether prices include VAT.
- **Shipping** – Fixed shipping amount.

Use **Save settings** to persist changes. **Reset to default** restores default config. **Load config…** / **Save config as…** import or export a full JSON config file.

### Packlist & Invoices

- **Load packlist (CSV)** – Drop or select a semicolon-delimited CSV with columns like `Name`, `Tracking`, `Product`, `Amount`, `SKU`. Rows with empty Name/Tracking are treated as part of the previous order.
- **Preview** and **Generate invoice** – Available at the **top** and **bottom** of the panel. Preview opens the PDF in your default viewer without saving; Generate invoice writes the PDF to your chosen path (or the configured save directory) and increments the invoice number. A **Generating…** overlay is shown while the PDF is built.
- **Fallback batch** – Optional batch value used when the packlist and SKU guide don’t provide one for a line.

The generated PDF has a **summary page** first, then one **sub-invoice per order** with line items (Pos, Marke, EAN, Charge/Batch, BBD, Art.-Nr., Produkt, Menge, Preis, USt%, Gesamt).

### History

Lists generated invoices (number, date, issued to, order count, file path) with an **Open** button to open the PDF.

## Build installers

After `npm install`:

```bash
npm run make
```

- **macOS**: `out/make/zip/darwin/` (e.g. `invoicing-system-darwin-x64-1.0.0.zip`)
- **Windows**: `out/make/squirrel.windows/` (Squirrel installer)

For a **Mac Intel** build:

```bash
npm run build:mac:intel
```

Electron is cross-platform; the same code runs on Mac, Windows, and Linux. Forge’s makers produce platform-specific installers from one codebase.

## Project setup (reference)

This project was set up manually as in the [Electron quick start](https://www.electronjs.org/docs/latest/tutorial/quick-start):

1. **npm init** – create the project and `package.json`
2. **npm install --save-dev electron** – add Electron
3. **Electron Forge** – for packaging and building installers

To scaffold a new app elsewhere:

```bash
npx create-electron-app@latest my-app-name
```

## Config and security

- **Config**: `config/config.json` (and when packaged, the app’s user data directory).
- **Unlock**: Access code hash is stored in `config/palette.json` (key `_c`). To reset access, clear that key or replace the file.
- **Ignored by git**: `node_modules/`, `config/config.json`, `config/palette.json`, build output, and other paths listed in `.gitignore`. Do not commit `node_modules` (it includes large Electron binaries).
