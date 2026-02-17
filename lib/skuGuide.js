const fs = require('fs');

/**
 * Parse semicolon-delimited SKU guide CSV (id;gtin;title or id;gtin;title;patch;price or ...;bbd).
 * Returns array of { id, gtin, title, batch?, price?, bbd?, articleNo? }.
 */
function parseSkuGuide(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows = lines.slice(1);
  const result = [];
  for (const line of rows) {
    const parts = splitSemicolonLine(line);
    if (parts.length < 2) continue;
    const id = (parts[0] || '').trim();
    const gtin = (parts[1] || '').trim();
    const title = (parts[2] || '').trim();
    const batch = (parts[3] != null ? String(parts[3]).trim() : '');
    const priceRaw = (parts.length > 4 && parts[4] != null ? String(parts[4]).trim() : '').replace(',', '.');
    const numPrice = priceRaw === '' ? null : parseFloat(priceRaw);
    const price = (numPrice != null && !isNaN(numPrice)) ? numPrice : null;
    const bbd = (parts.length > 5 && parts[5] != null ? String(parts[5]).trim() : '');
    const articleNo = (parts.length > 6 && parts[6] != null ? String(parts[6]).trim() : '');
    if (id) result.push({ id, gtin, title, batch: batch || undefined, price: price != null ? price : undefined, bbd: bbd || undefined, articleNo: articleNo || undefined });
  }
  return result;
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

module.exports = { parseSkuGuide, splitSemicolonLine };
