const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getConfigDir } = require('./config');
const PALETTE_FILE = path.join(getConfigDir(), 'palette.json');

function ensureDir() {
  const dir = path.dirname(PALETTE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function loadPalette() {
  ensureDir();
  if (!fs.existsSync(PALETTE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PALETTE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function savePalette(data) {
  ensureDir();
  fs.writeFileSync(PALETTE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getStoredChecksum() {
  const data = loadPalette();
  return data._c || null;
}

function setStoredChecksum(checksum) {
  const data = loadPalette();
  data._c = checksum;
  savePalette(data);
}

const DEFAULT_ACCESS = 'User0.1';

function ensureDefault() {
  if (getStoredChecksum() != null) return;
  setStoredChecksum(hash(DEFAULT_ACCESS));
}

function check(value) {
  ensureDefault();
  const stored = getStoredChecksum();
  if (!stored) return false;
  return hash(String(value).trim()) === stored;
}

function setAccess(newValue) {
  const trimmed = String(newValue).trim();
  if (!trimmed) return false;
  setStoredChecksum(hash(trimmed));
  return true;
}

module.exports = { check, setAccess, ensureDefault };
