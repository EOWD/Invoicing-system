const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const MARGIN = 36;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 841;
const LINE_HEIGHT = 14;
const ROW_HEIGHT = 14;
const TABLE_LINE_COLOR = rgb(0.4, 0.4, 0.4);
const TABLE_HEADER_BG = rgb(0.92, 0.92, 0.92);
const PLACEHOLDER_COLOR = rgb(0.5, 0.5, 0.55);

function place(txt, placeholder) {
  const s = (txt || '').trim();
  return s ? s : (placeholder || '—');
}

function isPlaceholder(txt, placeholder) {
  return !(txt || '').trim();
}

/** Format date for DE display (e.g. "30. Januar 2026"). */
function formatDateDE(date) {
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Draw a table: colX = [x0, x1, ...] (left of each column + right edge), rowYs = [y0, y1, ...] (top of each row). */
function drawTableBorders(page, colX, rowYs) {
  const lastX = colX[colX.length - 1];
  for (let i = 0; i < rowYs.length; i++) {
    const y = rowYs[i];
    page.drawLine({ start: { x: colX[0], y }, end: { x: lastX, y }, thickness: 0.5, color: TABLE_LINE_COLOR });
  }
  for (let i = 0; i < colX.length; i++) {
    const x = colX[i];
    const yTop = rowYs[0];
    const yBottom = rowYs[rowYs.length - 1];
    page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.5, color: TABLE_LINE_COLOR });
  }
}

/** Draw header background for first row (rowYs[0] to rowYs[1]). */
function drawTableHeaderBg(page, colX, rowYs) {
  const yTop = rowYs[0];
  const yBottom = rowYs[1];
  const xLeft = colX[0];
  const xRight = colX[colX.length - 1];
  page.drawRectangle({ x: xLeft, y: yBottom, width: xRight - xLeft, height: yTop - yBottom, color: TABLE_HEADER_BG });
}

function drawCellText(page, font, text, x, y, width, options) {
  const size = (options && options.size) || 8;
  const align = (options && options.align) || 'left';
  const maxChars = Math.floor(width / (size * 0.5));
  const str = text.length > maxChars ? text.slice(0, maxChars - 3) + '...' : text;
  let xPos = x + 3;
  if (align === 'right') {
    const tw = font.widthOfTextAtSize(str, size);
    xPos = x + width - tw - 3;
  }
  page.drawText(str, { x: xPos, y: y + 4, size, font, color: (options && options.color) || rgb(0, 0, 0) });
}

function brandFromTitle(title) {
  if (!title || !title.trim()) return '';
  const t = title.trim();
  if (/^[A-Z]{2}-[A-Z0-9-]+$/i.test(t) || (t.length <= 20 && !/\s/.test(t) && /[0-9]/.test(t))) return '';
  const first = t.split(/\s+/)[0];
  return first.length > 20 ? first.slice(0, 17) + '...' : first;
}

function getProductLookup(skuGuide, customProducts, prices) {
  const map = new Map();
  for (const p of skuGuide) {
    const title = p.title || p.id;
    map.set(p.id, {
      id: p.id,
      gtin: p.gtin || '',
      batch: p.batch || '',
      bbd: p.bbd || '',
      articleNo: p.articleNo || '',
      title,
      brand: p.brand || brandFromTitle(title),
      price: prices[p.id] != null ? Number(prices[p.id]) : (p.price != null ? Number(p.price) : 0),
    });
  }
  for (const [id, p] of Object.entries(customProducts || {})) {
    const existing = map.get(id);
    const title = (p.title && p.title.trim()) ? p.title : (existing && existing.title) || id;
    const gtin = (p.gtin != null && String(p.gtin).trim() !== '') ? String(p.gtin).trim() : (existing && existing.gtin) || '';
    const batch = (p.batch != null && String(p.batch).trim() !== '') ? String(p.batch).trim() : (existing && existing.batch) || '';
    const bbd = (p.bbd != null && String(p.bbd).trim() !== '') ? String(p.bbd).trim() : (existing && existing.bbd) || '';
    const articleNo = (p.articleNo != null && String(p.articleNo).trim() !== '') ? String(p.articleNo).trim() : (existing && existing.articleNo) || '';
    map.set(id, {
      id,
      gtin,
      batch,
      bbd,
      articleNo,
      title,
      brand: (p.brand && p.brand.trim()) ? p.brand : brandFromTitle(title),
      price: prices[id] != null ? Number(prices[id]) : (p.price != null ? Number(p.price) : (existing && existing.price != null ? existing.price : 0)),
    });
  }
  return map;
}

function computeOrderTotals(order, productLookup, config) {
  const vatRate = (config.tax && config.tax.vatRatePercent) || 0;
  const pricesIncludeVat = config.tax && config.tax.pricesIncludeVat;
  const lines = [];
  let subtotal = 0;
  const runBatch = (config.invoice && config.invoice.batchNumber != null) ? String(config.invoice.batchNumber).trim() : '';
  const inStock = config.inStock || {};
  for (const line of order.lines) {
    if (inStock[line.sku] === false) continue;
    const info = productLookup.get(line.sku);
    const unitPrice = info != null && info.price != null ? (Number(info.price) || 0) : 0;
    const guideTitleOk = info && info.title && String(info.title).trim() && info.title !== (info.id || '');
    const packlistProduct = (line.product && String(line.product).trim()) ? String(line.product).trim() : '';
    const displayTitle = (guideTitleOk ? info.title.trim() : null) || packlistProduct || (info && info.title ? info.title : '') || line.sku;
    const gtin = info ? info.gtin : '';
    const brand = (info && info.brand && String(info.brand).trim()) ? String(info.brand).trim() : brandFromTitle(displayTitle);
    const lineBatch = (line.batch != null && String(line.batch).trim() !== '') ? String(line.batch).trim() : '';
    const skuBatch = info && info.batch ? String(info.batch).trim() : '';
    const batch = lineBatch || skuBatch || runBatch;
    const bbd = (info && info.bbd && String(info.bbd).trim()) ? String(info.bbd).trim() : '';
    const articleNo = (info && info.articleNo && String(info.articleNo).trim()) ? String(info.articleNo).trim() : '';
    const qty = line.amount || 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    lines.push({ title: displayTitle, sku: line.sku, gtin, brand, batch, bbd, articleNo, qty, unitPrice, lineTotal });
  }
  const noItemsAvailable = lines.length === 0;
  const shippingAmount = noItemsAvailable ? 0 : (config.shipping && config.shipping.mode === 'fixed' ? (Number(config.shipping.fixedAmount) || 0) : 0);
  let vatAmount;
  let total;
  if (pricesIncludeVat) {
    total = subtotal + shippingAmount;
    vatAmount = total - total / (1 + vatRate / 100);
  } else {
    vatAmount = (subtotal + shippingAmount) * (vatRate / 100);
    total = subtotal + shippingAmount + vatAmount;
  }
  return { lines, subtotal, shippingAmount, vatAmount, total, vatRate, noItemsAvailable };
}

function drawLabel(page, font, x, y, value, placeholder, options) {
  const text = place(value, placeholder);
  const usePlaceholder = isPlaceholder(value, placeholder);
  const color = usePlaceholder ? PLACEHOLDER_COLOR : (options && options.color) || rgb(0.1, 0.1, 0.1);
  const size = (options && options.size) || 10;
  page.drawText(text, { x, y, size, font, color });
}

function drawTwoColumnFooter(page, config, font, yStart, invoiceNumber) {
  const company = config.company || {};
  const leftX = MARGIN;
  const rightX = 300;
  let y = yStart;
  const small = 8;
  page.drawText('Zahlungsdetails / Payment Information', { x: leftX, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  y -= LINE_HEIGHT;
  page.drawText(place(company.bankName, '[Bank]'), { x: leftX, y, size: small, font, color: isPlaceholder(company.bankName) ? PLACEHOLDER_COLOR : rgb(0, 0, 0) });
  y -= LINE_HEIGHT;
  const bankAddr = (company.bankAddress || '').trim();
  if (bankAddr) {
    page.drawText(bankAddr, { x: leftX, y, size: small, font });
    y -= LINE_HEIGHT;
  }
  page.drawText('IBAN: ' + place(company.bankAccount, '[IBAN]'), { x: leftX, y, size: small, font, color: isPlaceholder(company.bankAccount) ? PLACEHOLDER_COLOR : rgb(0, 0, 0) });
  y -= LINE_HEIGHT;
  page.drawText('BIC: ' + place(company.swift, '[BIC]'), { x: leftX, y, size: small, font, color: isPlaceholder(company.swift) ? PLACEHOLDER_COLOR : rgb(0, 0, 0) });
  if (invoiceNumber) {
    y -= LINE_HEIGHT;
    page.drawText('Zahlungsreferenz / Payment reference: ' + invoiceNumber, { x: leftX, y, size: small, font });
  }
  let yRight = yStart;
  page.drawText('Weitere Informationen / Company Information', { x: rightX, y: yRight, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  yRight -= LINE_HEIGHT;
  page.drawText(place(company.name, '[Company]'), { x: rightX, y: yRight, size: small, font, color: isPlaceholder(company.name) ? PLACEHOLDER_COLOR : rgb(0, 0, 0) });
  yRight -= LINE_HEIGHT;
  (company.address || '').split('\n').filter(Boolean).slice(0, 2).forEach((line) => {
    page.drawText(line, { x: rightX, y: yRight, size: small, font }); yRight -= LINE_HEIGHT;
  });
  if (company.ceo) { page.drawText('CEO: ' + company.ceo, { x: rightX, y: yRight, size: small, font }); yRight -= LINE_HEIGHT; }
  if (company.phone) { page.drawText('Phone: ' + company.phone, { x: rightX, y: yRight, size: small, font }); yRight -= LINE_HEIGHT; }
  if (company.website) { page.drawText('Web: ' + company.website, { x: rightX, y: yRight, size: small, font }); yRight -= LINE_HEIGHT; }
  if (company.email) { page.drawText('Email: ' + company.email, { x: rightX, y: yRight, size: small, font }); yRight -= LINE_HEIGHT; }
}

function addInvoicePage(doc, order, totals, config, invoiceNumber, font, page) {
  const { height } = page.getSize();
  let y = height - MARGIN;
  const company = config.company || {};
  const buyer = config.buyer || {};
  const invConfig = config.invoice || {};
  const currency = invConfig.currency || 'EUR';
  const dateStr = new Date().toISOString().slice(0, 10);

  page.drawText('Proforma', { x: MARGIN, y, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  y -= LINE_HEIGHT;
  page.drawText('Rechnungsnummer / Invoice number: ' + invoiceNumber, { x: MARGIN, y, size: 10, font });
  y -= LINE_HEIGHT;
  page.drawText('Order ref: ' + (order.tracking || '–'), { x: MARGIN, y, size: 9, font });
  y -= LINE_HEIGHT;
  page.drawText('Rechnungsdatum / Invoice date: ' + dateStr, { x: MARGIN, y, size: 9, font });
  y -= LINE_HEIGHT;
  page.drawText('Zahlungskonditionen / Payment terms: ' + place(invConfig.paymentTerms, '[Payment terms]'), { x: MARGIN, y, size: 9, font, color: isPlaceholder(invConfig.paymentTerms) ? PLACEHOLDER_COLOR : rgb(0, 0, 0) });
  y -= LINE_HEIGHT;
  const delTerms = (invConfig.deliveryTerms || '').trim();
  if (delTerms) {
    page.drawText('Lieferkonditionen / Delivery terms: ' + delTerms, { x: MARGIN, y, size: 9, font });
    y -= LINE_HEIGHT;
  }
  y -= LINE_HEIGHT * 0.5;

  const buyerName = (buyer.name || '').trim() || '[Buyer name]';
  const buyerAddr = (buyer.address || '').trim() || '[Address]';
  const buyerVat = (buyer.vatNumber || '').trim() || '';
  page.drawText('Firmenname / Company name: ' + buyerName, { x: MARGIN, y, size: 9, font });
  y -= LINE_HEIGHT;
  buyerAddr.split('\n').filter(Boolean).forEach((line) => {
    page.drawText(line, { x: MARGIN, y, size: 8, font }); y -= LINE_HEIGHT;
  });
  if (buyerVat) { page.drawText('USt-IdNr. ' + buyerVat, { x: MARGIN, y, size: 8, font }); y -= LINE_HEIGHT; }
  y -= LINE_HEIGHT;

  const invColWidths = [26, 40, 68, 58, 48, 36, 89, 38, 28, 28, 64]; // Pos, Marke, EAN, Charge/Batch, BBD, Art.-Nr., Produkt, Menge, Preis, USt%, Gesamt
  const invColX = [MARGIN, MARGIN + 26, MARGIN + 66, MARGIN + 134, MARGIN + 192, MARGIN + 240, MARGIN + 276, 401, 439, 467, 495, PAGE_WIDTH - MARGIN];
  const tableTop = y;
  const hasNoItems = totals.noItemsAvailable || totals.lines.length === 0;
  const numRows = 1 + (hasNoItems ? 1 : totals.lines.length);
  const rowYs = [];
  for (let i = 0; i <= numRows; i++) rowYs.push(tableTop - i * ROW_HEIGHT);
  drawTableHeaderBg(page, invColX, [rowYs[0], rowYs[1]]);
  drawTableBorders(page, invColX, rowYs);
  drawCellText(page, font, 'Pos', invColX[0], rowYs[1], invColWidths[0], { size: 7 });
  drawCellText(page, font, 'Marke', invColX[1], rowYs[1], invColWidths[1], { size: 7 });
  drawCellText(page, font, 'EAN', invColX[2], rowYs[1], invColWidths[2], { size: 7 });
  drawCellText(page, font, 'Charge/Batch', invColX[3], rowYs[1], invColWidths[3], { size: 7 });
  drawCellText(page, font, 'BBD', invColX[4], rowYs[1], invColWidths[4], { size: 7 });
  drawCellText(page, font, 'Art.-Nr.', invColX[5], rowYs[1], invColWidths[5], { size: 7 });
  drawCellText(page, font, 'Produkt / Product', invColX[6], rowYs[1], invColWidths[6], { size: 7 });
  drawCellText(page, font, 'Menge', invColX[7], rowYs[1], invColWidths[7], { size: 7 });
  drawCellText(page, font, 'Preis', invColX[8], rowYs[1], invColWidths[8], { size: 7 });
  drawCellText(page, font, 'USt%', invColX[9], rowYs[1], invColWidths[9], { size: 7 });
  drawCellText(page, font, 'Gesamt', invColX[10], rowYs[1], invColWidths[10], { size: 7, align: 'right' });
  const vatPct = totals.vatRate;
  if (hasNoItems) {
    const rowY = rowYs[2];
    const notAvailableText = 'No items available / Nicht verfügbar';
    drawCellText(page, font, '–', invColX[0], rowY, invColWidths[0], { size: 7 });
    drawCellText(page, font, notAvailableText, invColX[6], rowY, invColWidths[6], { size: 7 });
    drawCellText(page, font, '0.00 ' + currency, invColX[10], rowY, invColWidths[10], { size: 7, align: 'right' });
  } else {
    for (let i = 0; i < totals.lines.length; i++) {
      const l = totals.lines[i];
      const rowY = rowYs[i + 2];
      drawCellText(page, font, String(i + 1), invColX[0], rowY, invColWidths[0], { size: 7 });
      drawCellText(page, font, (l.brand || '').slice(0, 8), invColX[1], rowY, invColWidths[1], { size: 7 });
      drawCellText(page, font, (l.gtin || '').slice(0, 13), invColX[2], rowY, invColWidths[2], { size: 7 });
      drawCellText(page, font, (l.batch || '').slice(0, 14), invColX[3], rowY, invColWidths[3], { size: 7 });
      drawCellText(page, font, (l.bbd || '').slice(0, 10), invColX[4], rowY, invColWidths[4], { size: 7 });
      drawCellText(page, font, (l.articleNo || '').slice(0, 8), invColX[5], rowY, invColWidths[5], { size: 7 });
      const desc = (l.title || '').length > 36 ? (l.title || '').slice(0, 33) + '...' : (l.title || '');
      drawCellText(page, font, desc, invColX[6], rowY, invColWidths[6], { size: 7 });
      drawCellText(page, font, String(l.qty), invColX[7], rowY, invColWidths[7], { size: 7 });
      drawCellText(page, font, l.unitPrice.toFixed(2), invColX[8], rowY, invColWidths[8], { size: 7 });
      drawCellText(page, font, String(vatPct) + '%', invColX[9], rowY, invColWidths[9], { size: 7 });
      drawCellText(page, font, l.lineTotal.toFixed(2) + ' ' + currency, invColX[10], rowY, invColWidths[10], { size: 7, align: 'right' });
    }
  }
  y = rowYs[rowYs.length - 1] - LINE_HEIGHT;
  if (y < MARGIN + 120) {
    const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = newPage.getHeight() - MARGIN;
    page = newPage;
  }
  const totalsRightX = PAGE_WIDTH - MARGIN;
  const subVal = totals.subtotal.toFixed(2) + ' ' + currency;
  page.drawText('Zwischensumme / Subtotal net', { x: 360, y, size: 9, font });
  page.drawText(subVal, { x: totalsRightX - font.widthOfTextAtSize(subVal, 9), y, size: 9, font });
  y -= LINE_HEIGHT;
  if (totals.shippingAmount != null && totals.shippingAmount > 0) {
    const shipVal = totals.shippingAmount.toFixed(2) + ' ' + currency;
    page.drawText('Versandkosten / Shipping', { x: 360, y, size: 9, font });
    page.drawText(shipVal, { x: totalsRightX - font.widthOfTextAtSize(shipVal, 9), y, size: 9, font });
    y -= LINE_HEIGHT;
  }
  const vatVal = totals.vatAmount.toFixed(2) + ' ' + currency;
  page.drawText('Umsatzsteuer / VAT ' + vatPct + '%', { x: 360, y, size: 9, font });
  page.drawText(vatVal, { x: totalsRightX - font.widthOfTextAtSize(vatVal, 9), y, size: 9, font });
  y -= LINE_HEIGHT;
  const totalVal = totals.total.toFixed(2) + ' ' + currency;
  page.drawText('Total gross:', { x: 360, y, size: 10, font });
  page.drawText(totalVal, { x: totalsRightX - font.widthOfTextAtSize(totalVal, 10), y, size: 10, font });
  y -= LINE_HEIGHT * 2;
  page.drawText('Rechnungsnummer / Invoice number: ' + invoiceNumber, { x: MARGIN, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
}

const LOGO_MAX_HEIGHT = 40;
/** Reserve space at bottom of summary for totals + footer (pt). */
const SUMMARY_FOOTER_RESERVE = 160;

function addSummaryPage(doc, ordersWithTotals, config, font, page, summaryNumber, logoImage) {
  const { height } = page.getSize();
  let y = height - MARGIN;
  const PAGE_MIN_Y = MARGIN + SUMMARY_FOOTER_RESERVE;
  if (logoImage) {
    const scale = Math.min(1, LOGO_MAX_HEIGHT / logoImage.height);
    const w = logoImage.width * scale;
    const h = logoImage.height * scale;
    const logoX = PAGE_WIDTH - MARGIN - w;
    page.drawImage(logoImage, { x: logoX, y: y - h, width: w, height: h });
    y -= h + LINE_HEIGHT;
  }
  const company = config.company || {};
  const buyer = config.buyer || {};
  const invConfig = config.invoice || {};
  const currency = invConfig.currency || 'EUR';
  const now = new Date();
  const dateStrFormatted = formatDateDE(now);
  let grandSubtotalNet = 0;
  let grandVat = 0;
  let grandTotal = 0;
  const vatRatePct = ordersWithTotals.length ? ordersWithTotals[0].totals.vatRate : (config.tax && config.tax.vatRatePercent) || 0;
  for (let i = 0; i < ordersWithTotals.length; i++) {
    const t = ordersWithTotals[i].totals;
    grandSubtotalNet += t.subtotal + (t.shippingAmount || 0);
    grandVat += t.vatAmount;
    grandTotal += t.total;
  }

  function fmtMoney(n) {
    return n.toFixed(2).replace('.', ',') + ' ' + currency;
  }

  // Row 1: Proforma (left) | Rechnungsnummer / Invoice number: XXX (right)
  page.drawText('Proforma', { x: MARGIN, y, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  const invNumStr = 'Rechnungsnummer / Invoice number: ' + summaryNumber;
  const numW = font.widthOfTextAtSize(invNumStr, 10);
  page.drawText(invNumStr, { x: PAGE_WIDTH - MARGIN - numW, y, size: 10, font });
  y -= LINE_HEIGHT;

  // Row 2: Rechnungsdatum (left) | Date (right)
  page.drawText('Rechnungsdatum / Invoice date:', { x: MARGIN, y, size: 9, font });
  const dateRightW = font.widthOfTextAtSize(dateStrFormatted, 9);
  page.drawText(dateStrFormatted, { x: PAGE_WIDTH - MARGIN - dateRightW, y, size: 9, font });
  y -= LINE_HEIGHT;

  // Summary block: proper table with 2 columns (details | totals) and 5 rows
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TABLE_LINE_COLOR });
  y -= 4;

  const summaryColX = [MARGIN, 320, PAGE_WIDTH - MARGIN];
  const summaryColWidths = [320 - MARGIN, (PAGE_WIDTH - MARGIN) - 320];
  const numSummaryRows = 5;
  const summaryRowYs = [];
  for (let i = 0; i <= numSummaryRows; i++) summaryRowYs.push(y - i * ROW_HEIGHT);
  const summaryTopY = summaryRowYs[0];
  const summaryBottomY = summaryRowYs[summaryRowYs.length - 1];

  drawTableBorders(page, summaryColX, summaryRowYs);

  function truncateToWidth(str, font, size, maxW) {
    if (font.widthOfTextAtSize(str, size) <= maxW) return str;
    let s = str;
    while (s.length && font.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1);
    return (s || str.slice(0, 1)) + '...';
  }

  const detailSz = 8;
  const leftLabelX = MARGIN + 4;
  const leftValueX = 195;
  const rightLabelX = 324;
  const rightValueX = PAGE_WIDTH - MARGIN - 4;
  const paymentTermsVal = place(invConfig.paymentTerms, '[Payment terms]');
  const delTerms = (invConfig.deliveryTerms || '').trim();
  const commentsVal = (invConfig.footerNotes || '').trim();

  const detailLabels = ['Bestelldatum / Order date:', 'Fälligkeitsdatum / Due date:', 'Zahlungskonditionen / Payment terms:', 'Lieferkonditionen / Delivery terms:', 'Kommentar / Comments:'];
  const detailValues = [dateStrFormatted, 'sofort', paymentTermsVal, delTerms || '—', commentsVal || '—'];

  for (let i = 0; i < numSummaryRows; i++) {
    const cellY = summaryRowYs[i + 1];
    page.drawText(detailLabels[i], { x: leftLabelX, y: cellY + 4, size: detailSz, font });
    const val = truncateToWidth(detailValues[i], font, detailSz, 118);
    page.drawText(val, { x: leftValueX, y: cellY + 4, size: detailSz, font });
  }

  const totSz = 9;
  const totLblSz = 8;
  const subNetStr = fmtMoney(grandSubtotalNet);
  const vatStr = fmtMoney(grandVat);
  const totalStr = fmtMoney(grandTotal);
  const rightRows = [
    { label: 'Zwischensumme / Subtotal net', value: subNetStr, size: totSz },
    { label: 'Umsatzsteuer / VAT ' + vatRatePct + '%', value: vatStr, size: totSz },
    { label: 'Gesamtbetrag brutto / Total gross', value: totalStr, size: totSz + 1 },
  ];
  for (let i = 0; i < rightRows.length; i++) {
    const cellY = summaryRowYs[i + 1];
    const r = rightRows[i];
    page.drawText(r.label, { x: rightLabelX, y: cellY + 4, size: totLblSz, font });
    page.drawText(r.value, { x: rightValueX - font.widthOfTextAtSize(r.value, r.size), y: cellY + 4, size: r.size, font });
  }

  y = summaryBottomY - LINE_HEIGHT;

  // Horizontal line above address section
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TABLE_LINE_COLOR });
  y -= LINE_HEIGHT;

  // Address section: two columns — Firmenname/Anschrift (left) | Lieferadresse (right)
  const addrLeftX = MARGIN;
  const addrRightX = PAGE_WIDTH / 2 + 20;
  const addrStartY = y;
  const buyerName = buyer.name || '[Buyer name]';
  const buyerAddr = (buyer.address || '[Address]').trim();
  const deliveryAddr = buyerAddr;

  page.drawText('Firmenname / Company name:', { x: addrLeftX, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  y -= LINE_HEIGHT;
  page.drawText(buyerName, { x: addrLeftX, y, size: 9, font });
  y -= LINE_HEIGHT;
  page.drawText('Anschrift / Address:', { x: addrLeftX, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  y -= LINE_HEIGHT;
  buyerAddr.split('\n').filter(Boolean).forEach((line) => {
    page.drawText(line, { x: addrLeftX, y, size: 8, font }); y -= LINE_HEIGHT;
  });
  if (buyer.vatNumber) { page.drawText('USt-IdNr. ' + buyer.vatNumber, { x: addrLeftX, y, size: 8, font }); y -= LINE_HEIGHT; }

  let yRight = addrStartY;
  page.drawText('Lieferadresse / Delivery address:', { x: addrRightX, y: yRight, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  yRight -= LINE_HEIGHT;
  page.drawText(buyerName, { x: addrRightX, y: yRight, size: 9, font });
  yRight -= LINE_HEIGHT;
  deliveryAddr.split('\n').filter(Boolean).forEach((line) => {
    page.drawText(line, { x: addrRightX, y: yRight, size: 8, font }); yRight -= LINE_HEIGHT;
  });

  y -= LINE_HEIGHT;

  // Orders table (paginate if too many rows)
  const sumColX = [MARGIN, 160, 400, PAGE_WIDTH - MARGIN];
  const sumColWidths = [124, 240, 123];
  const totalOrders = ordersWithTotals.length;
  let orderIndex = 0;

  function drawOrdersTableRows(currentPage, startY, fromIdx, toIdx) {
    const numRows = toIdx - fromIdx;
    const sumRowYs = [];
    for (let i = 0; i <= numRows + 1; i++) sumRowYs.push(startY - i * ROW_HEIGHT);
    drawTableHeaderBg(currentPage, sumColX, [sumRowYs[0], sumRowYs[1]]);
    drawTableBorders(currentPage, sumColX, sumRowYs);
    drawCellText(currentPage, font, 'Order ref', sumColX[0], sumRowYs[1], sumColWidths[0], { size: 9 });
    drawCellText(currentPage, font, 'Customer', sumColX[1], sumRowYs[1], sumColWidths[1], { size: 9 });
    drawCellText(currentPage, font, 'Total', sumColX[2], sumRowYs[1], sumColWidths[2], { size: 9, align: 'right' });
    for (let i = 0; i < numRows; i++) {
      const { order, totals } = ordersWithTotals[fromIdx + i];
      const rowY = sumRowYs[i + 2];
      const nameStr = (order.name || buyer.name || '').length > 35 ? (order.name || buyer.name || '').slice(0, 32) + '...' : (order.name || buyer.name || '');
      drawCellText(currentPage, font, order.tracking || '-', sumColX[0], rowY, sumColWidths[0]);
      drawCellText(currentPage, font, nameStr, sumColX[1], rowY, sumColWidths[1]);
      drawCellText(currentPage, font, totals.total.toFixed(2) + ' ' + currency, sumColX[2], rowY, sumColWidths[2], { align: 'right' });
    }
    return sumRowYs[sumRowYs.length - 1];
  }

  while (orderIndex < totalOrders) {
    const maxRowsHere = Math.max(1, Math.floor((y - PAGE_MIN_Y) / ROW_HEIGHT) - 1);
    const rowsOnThisPage = Math.min(maxRowsHere, totalOrders - orderIndex);
    const tableBottomY = drawOrdersTableRows(page, y, orderIndex, orderIndex + rowsOnThisPage);
    orderIndex += rowsOnThisPage;

    if (orderIndex >= totalOrders) {
      y = tableBottomY - LINE_HEIGHT;
      break;
    }
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = height - MARGIN;
    page.drawText('Summary (continued) / Fortsetzung', { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= LINE_HEIGHT * 1.5;
  }

  const totalsLeftX = 360;
  const totalsRightX = PAGE_WIDTH - MARGIN;
  const sz = 9;
  const szTotal = 10;
  page.drawText('Zwischensumme / Subtotal net', { x: totalsLeftX, y, size: sz, font });
  page.drawText(fmtMoney(grandSubtotalNet), { x: totalsRightX - font.widthOfTextAtSize(fmtMoney(grandSubtotalNet), sz), y, size: sz, font });
  y -= LINE_HEIGHT;
  page.drawText('Umsatzsteuer / VAT ' + vatRatePct + '%', { x: totalsLeftX, y, size: sz, font });
  page.drawText(fmtMoney(grandVat), { x: totalsRightX - font.widthOfTextAtSize(fmtMoney(grandVat), sz), y, size: sz, font });
  y -= LINE_HEIGHT;
  page.drawText('Gesamtbetrag brutto / Total gross', { x: totalsLeftX, y, size: sz, font });
  page.drawText(fmtMoney(grandTotal), { x: totalsRightX - font.widthOfTextAtSize(fmtMoney(grandTotal), szTotal), y, size: szTotal, font });
  y -= LINE_HEIGHT * 2;
  drawTwoColumnFooter(page, config, font, y, summaryNumber);
}

async function buildPdf(orders, config, skuGuide, outputPath) {
  const productLookup = getProductLookup(skuGuide, config.customProducts, config.prices || {});
  const ordersWithTotals = orders.map((order) => {
    const totals = computeOrderTotals(order, productLookup, config);
    return { order, totals };
  });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // Set document title to invoice number so PDF viewer shows it
  const invConfig = config.invoice || {};
  const prefix = invConfig.prefix || 'INV';
  const year = new Date().getFullYear();
  let nextNumber = invConfig.nextNumber != null ? invConfig.nextNumber : 1;
  const baseNumber = prefix + '-' + year + '-' + String(nextNumber).padStart(5, '0');
  doc.setTitle(baseNumber);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  let logoImage = null;
  const logoPath = config.company && (config.company.logoPath || '').trim();
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const bytes = fs.readFileSync(logoPath);
      const ext = path.extname(logoPath).toLowerCase();
      if (ext === '.png') logoImage = await doc.embedPng(bytes);
      else if (ext === '.jpg' || ext === '.jpeg') logoImage = await doc.embedJpg(bytes);
    } catch (_) { /* ignore invalid or unsupported image */ }
  }
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  addSummaryPage(doc, ordersWithTotals, config, font, page, baseNumber, logoImage);
  for (let i = 0; i < ordersWithTotals.length; i++) {
    const { order, totals } = ordersWithTotals[i];
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const subNumber = baseNumber + '/' + (i + 1);
    addInvoicePage(doc, order, totals, config, subNumber, font, page);
  }
  nextNumber += 1;
  const pdfBytes = await doc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return { path: outputPath, nextNumber, baseNumber };
}

module.exports = { buildPdf, getProductLookup, computeOrderTotals };
