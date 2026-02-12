// Invoicing System - Main process (Mac & Windows compatible)
if (require('electron-squirrel-startup')) process.exit(0);
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');

const { parseSkuGuide } = require('./lib/skuGuide');
const { parsePacklist, parsePacklistFromContent } = require('./lib/packlist');
const { loadConfig, saveConfig, resetToDefault, loadConfigFromFile, saveConfigToFile, getActiveSender, getActiveReceiver } = require('./lib/config');
const { buildPdf } = require('./lib/pdfBuilder');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  // Open DevTools when developing (not when app is packaged)
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function loadSkuGuideFromPath(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  }
  return parseSkuGuide(filePath);
}

ipcMain.handle('read-sku-guide', async (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { products: [], error: 'File not found' };
  try {
    const products = loadSkuGuideFromPath(filePath);
    return { products };
  } catch (e) {
    return { products: [], error: e.message };
  }
});

const defaultSkuGuidePath = path.join(__dirname, 'config', 'skuGuide.json');

ipcMain.handle('load-default-sku-guide', async () => {
  try {
    const products = loadSkuGuideFromPath(defaultSkuGuidePath);
    return { products };
  } catch (e) {
    return { products: [], error: e.message };
  }
});

ipcMain.handle('get-default-sku-guide-path', async () => {
  return defaultSkuGuidePath;
});

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (_, config) => {
  if (!config) return loadConfig();
  return saveConfig(config);
});

ipcMain.handle('reset-config-to-default', async () => {
  return resetToDefault();
});

ipcMain.handle('load-config-file', async (_, filePath) => {
  return loadConfigFromFile(filePath);
});

ipcMain.handle('save-config-as', async (_, { filePath, config }) => {
  saveConfigToFile(filePath, config);
});

ipcMain.handle('read-packlist', async (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { orders: [], error: 'File not found' };
  try {
    const { orders } = parsePacklist(filePath);
    return { orders };
  } catch (e) {
    return { orders: [], error: e.message };
  }
});

ipcMain.handle('parse-packlist-content', async (_, csvContent) => {
  if (!csvContent || typeof csvContent !== 'string') return { orders: [] };
  try {
    const { orders } = parsePacklistFromContent(csvContent);
    return { orders };
  } catch (e) {
    return { orders: [], error: e.message };
  }
});

ipcMain.handle('show-open-dialog', async (_, options) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || mainWindow, options || { properties: ['openFile'] });
  return result;
});

ipcMain.handle('show-save-dialog', async (_, options) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(win || mainWindow, options || {});
  return result;
});

ipcMain.handle('open-path', async (_, filePath) => {
  if (filePath && typeof filePath === 'string') shell.openPath(filePath);
});

ipcMain.handle('get-default-invoice-path', (_, { saveDir, filename }) => {
  if (!saveDir || typeof saveDir !== 'string') return filename || 'invoice.pdf';
  const date = new Date().toISOString().slice(0, 10);
  return path.join(saveDir.trim(), date, filename || 'invoice.pdf');
});

ipcMain.handle('generate-pdf', async (_, { orders, config, skuGuidePath, outputPath, preview }) => {
  if (!orders || !orders.length) return { path: null, error: 'No orders' };
  const cfg = loadConfig();
  let skuGuide = [];
  if (skuGuidePath && fs.existsSync(skuGuidePath)) {
    skuGuide = loadSkuGuideFromPath(skuGuidePath);
  }
  if (skuGuide.length === 0 && fs.existsSync(defaultSkuGuidePath)) {
    skuGuide = loadSkuGuideFromPath(defaultSkuGuidePath);
  }
  const out = preview
    ? path.join(app.getPath('temp'), 'invoices_preview_' + Date.now() + '.pdf')
    : (outputPath || path.join(app.getPath('documents'), 'invoices_' + new Date().toISOString().slice(0, 10) + '.pdf'));
  const outDir = path.dirname(out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const company = getActiveSender(cfg) || cfg.company;
  const buyer = getActiveReceiver(cfg) || cfg.buyer;
  const invoiceFromRequest = (config && config.invoice) || {};
  const pdfConfig = {
    ...cfg,
    company: company || {},
    buyer: buyer || {},
    invoice: { ...(cfg.invoice || {}), ...invoiceFromRequest },
  };
  try {
    const result = await buildPdf(orders, pdfConfig, skuGuide, out);
    if (!preview && result.nextNumber != null && cfg.invoice) {
      cfg.invoice.nextNumber = result.nextNumber;
      if (!Array.isArray(cfg.invoiceHistory)) cfg.invoiceHistory = [];
      const issuedTo = buyer && buyer.name ? String(buyer.name).trim() : '';
      cfg.invoiceHistory.unshift({
        invoiceNumber: result.baseNumber || (cfg.invoice.prefix || 'INV') + '-' + new Date().getFullYear() + '-' + String(result.nextNumber - 1).padStart(5, '0'),
        date: new Date().toISOString().slice(0, 10),
        issuedTo,
        filePath: result.path,
        orderCount: orders.length,
      });
      saveConfig(cfg);
    }
    if (preview && result.path) shell.openPath(result.path);
    return { path: result.path, baseNumber: result.baseNumber, error: null };
  } catch (e) {
    return { path: null, error: e.message };
  }
});
