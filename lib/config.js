const fs = require('fs');
const path = require('path');

function getConfigDir() {
  try {
    const { app } = require('electron');
    // Always use userData when running in Electron (both packaged and dev)
    // This avoids trying to write to app.asar which is read-only
    if (app) {
      return path.join(app.getPath('userData'), 'config');
    }
  } catch (e) {
    // Fallback for non-Electron environments (CLI, tests, etc.)
  }
  return path.join(__dirname, '..', 'config');
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'default.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadDefault() {
  if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
    const def = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
    if (!def.senderProfiles) def.senderProfiles = [];
    if (!def.receiverProfiles) def.receiverProfiles = [];
    if (def.activeSenderId == null) def.activeSenderId = '';
    if (def.activeReceiverId == null) def.activeReceiverId = '';
    return def;
  }
  return {
    senderProfiles: [],
    receiverProfiles: [],
    activeSenderId: '',
    activeReceiverId: '',
    invoice: { currency: 'EUR', prefix: 'INV', nextNumber: 1, saveDirectory: '', paymentTerms: 'Net 30', deliveryTerms: '', footerNotes: '', batchNumber: '' },
    inStock: {},
    invoiceHistory: [],
    tax: { vatRatePercent: 20, pricesIncludeVat: false },
    shipping: { mode: 'fixed', fixedAmount: 0 },
    prices: {},
    customProducts: {},
  };
}

function migrateToProfiles(data) {
  const out = { ...data };
  if (!Array.isArray(out.senderProfiles)) out.senderProfiles = [];
  if (!Array.isArray(out.receiverProfiles)) out.receiverProfiles = [];
  if (out.activeSenderId == null) out.activeSenderId = '';
  if (out.activeReceiverId == null) out.activeReceiverId = '';
  if (out.company && out.senderProfiles.length === 0) {
    const c = out.company;
    const id = 'sender-' + Date.now();
    out.senderProfiles.push({
      id,
      name: c.name || '',
      address: c.address || '',
      vatNumber: c.vatNumber || '',
      companyCode: c.companyCode || '',
      phone: c.phone || '',
      email: c.email || '',
      ceo: c.ceo || '',
      website: c.website || '',
      logoPath: c.logoPath || '',
      bankName: c.bankName || '',
      bankAccount: c.bankAccount || '',
      swift: c.swift || '',
    });
    out.activeSenderId = id;
  }
  if (out.buyer && out.receiverProfiles.length === 0 && (out.buyer.name || out.buyer.address || out.buyer.vatNumber)) {
    const b = out.buyer;
    const id = 'receiver-' + Date.now();
    out.receiverProfiles.push({
      id,
      name: b.name || '',
      address: b.address || '',
      vatNumber: b.vatNumber || '',
    });
    out.activeReceiverId = id;
  }
  return out;
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const merged = { ...loadDefault(), ...data };
      return migrateToProfiles(merged);
    } catch (e) {
      return loadDefault();
    }
  }
  return loadDefault();
}

/** Get the currently active sender profile (for PDF). Falls back to first profile or legacy company. */
function getActiveSender(config) {
  if (!config) return null;
  if (config.activeSenderId && Array.isArray(config.senderProfiles)) {
    const s = config.senderProfiles.find((p) => p.id === config.activeSenderId);
    if (s) return s;
  }
  if (config.senderProfiles && config.senderProfiles.length > 0) return config.senderProfiles[0];
  if (config.company) return config.company;
  return null;
}

/** Get the currently active receiver profile (for PDF). Falls back to first profile or legacy buyer. */
function getActiveReceiver(config) {
  if (!config) return null;
  if (config.activeReceiverId && Array.isArray(config.receiverProfiles)) {
    const r = config.receiverProfiles.find((p) => p.id === config.activeReceiverId);
    if (r) return r;
  }
  if (config.receiverProfiles && config.receiverProfiles.length > 0) return config.receiverProfiles[0];
  if (config.buyer) return config.buyer;
  return null;
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  return loadConfig();
}

/** Reset main config to default.json and return it. */
function resetToDefault() {
  const def = loadDefault();
  saveConfig(def);
  return loadConfig();
}

/** Load a config from a file and make it the main config (saves to config.json). */
function loadConfigFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const merged = { ...loadDefault(), ...data };
  saveConfig(merged);
  return loadConfig();
}

/** Save current config to a different file (does not change main config). */
function saveConfigToFile(filePath, config) {
  if (!filePath || !config) return;
  ensureConfigDir();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { loadConfig, saveConfig, loadDefault, resetToDefault, loadConfigFromFile, saveConfigToFile, getActiveSender, getActiveReceiver, getConfigDir, CONFIG_FILE };
