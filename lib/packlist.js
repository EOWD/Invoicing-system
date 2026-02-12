const fs = require('fs');

/**
 * Parse semicolon-delimited packlist CSV (Name;Tracking;Product;Amount;SKU or with optional Batch/Patch column).
 * Group by (Name, Tracking); empty Name+Tracking = same as previous order.
 * Returns { orders: [{ name, tracking, lines: [{ product, sku, amount, batch }] }] }.
 */
function parsePacklistFromContent(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { orders: [] };
  const rows = lines.slice(1);
  const orders = [];
  let currentOrder = null;
  for (const line of rows) {
    const parts = splitSemicolonLine(line);
    const name = (parts[0] || '').trim();
    const tracking = (parts[1] || '').trim();
    const product = (parts[2] || '').trim();
    const amount = parseInt(parts[3], 10) || 0;
    const sku = (parts[4] || '').trim();
    const batch = (parts[5] || '').trim();
    const hasOrderKey = name || tracking;
    if (hasOrderKey) {
      currentOrder = { name, tracking, lines: [] };
      orders.push(currentOrder);
    }
    if (currentOrder && (product || sku)) {
      currentOrder.lines.push({ product, sku, amount, batch });
    }
  }
  return { orders };
}

function parsePacklist(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  return parsePacklistFromContent(raw);
}

function splitSemicolonLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ';' && !inQuotes) || c === '\t') {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts;
}

module.exports = { parsePacklist, parsePacklistFromContent, splitSemicolonLine };
