(function () {
  const api = window.invoicing;

  if (api && api.getAssetUrl) {
    api.getAssetUrl('logo.png').then((url) => {
      if (url) {
        document.querySelectorAll('.app-header-logo, .login-logo').forEach((img) => { img.src = url; });
      }
    });
  }

  const loginForm = document.getElementById('loginForm');
  const loginInput = document.getElementById('loginInput');
  const loginError = document.getElementById('loginError');
  const loginOverlay = document.getElementById('loginOverlay');
  const appMain = document.getElementById('appMain');

  if (loginForm && api) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) loginError.textContent = '';
      const value = loginInput ? loginInput.value : '';
      const result = await api.checkUnlock(value);
      if (result && result.ok) {
        loginOverlay.classList.add('hidden');
        appMain.classList.remove('hidden');
        if (loginInput) loginInput.value = '';
      } else {
        if (loginError) loginError.textContent = 'Incorrect access code';
        if (loginInput) loginInput.select();
      }
    });
    if (loginInput) loginInput.focus();
  }

  let skuGuidePath = '';
  let packlistPath = '';
  let products = [];
  let config = null;
  let orders = [];

  function showMessage(panelId, text, type) {
    const id = panelId + 'Message';
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'message ' + (type || 'info');
  }

  function showSaveSpinner(message) {
    const el = document.getElementById('saveSpinnerOverlay');
    const textEl = document.getElementById('saveSpinnerText');
    if (textEl) textEl.textContent = message || 'Saving…';
    if (el) { el.classList.add('visible'); el.setAttribute('aria-hidden', 'false'); }
  }
  function hideSaveSpinner() {
    const el = document.getElementById('saveSpinnerOverlay');
    if (el) { el.classList.remove('visible'); el.setAttribute('aria-hidden', 'true'); }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    const panel = document.getElementById('panel-' + tabId);
    const btn = document.querySelector('.tabs button[data-tab="' + tabId + '"]');
    if (panel) panel.classList.add('active');
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    }
  }

  // Tab switching: run as soon as DOM is ready (does not depend on api)
  document.querySelectorAll('.tabs button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
      if (tabId === 'packlist' && api) {
        const c = await api.getConfig();
        const el = document.getElementById('packlistBatchNumber');
        if (el) el.value = (c && c.invoice && c.invoice.batchNumber != null) ? String(c.invoice.batchNumber) : '';
      }
      if (tabId === 'history' && typeof renderInvoiceHistory === 'function') renderInvoiceHistory();
    });
  });

  async function renderInvoiceHistory() {
    const tbody = document.getElementById('historyTable');
    const msgEl = document.getElementById('historyMessage');
    if (!tbody) return;
    try {
      const c = await api.getConfig();
      const list = Array.isArray(c.invoiceHistory) ? c.invoiceHistory : [];
      tbody.innerHTML = '';
      if (list.length === 0) {
        if (msgEl) { msgEl.textContent = 'No invoices generated yet.'; msgEl.className = 'message info'; }
        return;
      }
      if (msgEl) msgEl.textContent = '';
      list.forEach((entry) => {
        const tr = document.createElement('tr');
        const fileLabel = entry.filePath ? entry.filePath.replace(/^.*[/\\]/, '') : '—';
        tr.innerHTML =
          '<td>' + escapeHtml(entry.invoiceNumber || '—') + '</td>' +
          '<td>' + escapeHtml(entry.date || '—') + '</td>' +
          '<td>' + escapeHtml(entry.issuedTo != null ? entry.issuedTo : '') + '</td>' +
          '<td>' + escapeHtml(String(entry.orderCount != null ? entry.orderCount : '—')) + '</td>' +
          '<td class="file-path">' + escapeHtml(fileLabel) + '</td>' +
          '<td><button type="button" class="secondary btn-open-pdf" data-path="' + escapeHtml(entry.filePath || '') + '">Open</button></td>';
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('.btn-open-pdf').forEach((b) => {
        b.addEventListener('click', function () {
          const p = this.getAttribute('data-path');
          if (p) api.openPath(p);
        });
      });
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Could not load history: ' + e.message; msgEl.className = 'message error'; }
    }
  }

  function mergeProducts() {
    const guide = products;
    const custom = config && config.customProducts ? config.customProducts : {};
    const prices = config && config.prices ? config.prices : {};
    const inStock = config && config.inStock ? config.inStock : {};
    const map = new Map();
    guide.forEach((p) => map.set(p.id, {
      ...p,
      price: prices[p.id] != null ? prices[p.id] : (p.price != null ? p.price : ''),
      inStock: inStock[p.id] === false ? false : true,
      bbd: p.bbd != null ? p.bbd : '',
      articleNo: p.articleNo != null ? p.articleNo : '',
    }));
    Object.entries(custom).forEach(([id, p]) => {
      const existing = map.get(id);
      map.set(id, {
        id,
        gtin: p.gtin != null ? p.gtin : (existing && existing.gtin) || '',
        batch: p.batch != null ? p.batch : (existing && existing.batch) || '',
        bbd: p.bbd != null ? p.bbd : (existing && existing.bbd) || '',
        articleNo: p.articleNo != null ? p.articleNo : (existing && existing.articleNo) || '',
        title: (p.title && p.title.trim()) ? p.title : (existing && existing.title) || id,
        price: prices[id] != null ? prices[id] : (p.price != null ? p.price : (existing && existing.price != null ? existing.price : '')),
        inStock: inStock[id] === false ? false : true,
      });
    });
    return Array.from(map.values());
  }

  function renderPricesTable() {
    const tbody = document.querySelector('#pricesTable tbody');
    const searchEl = document.getElementById('catalogSearch');
    const searchRaw = searchEl ? (searchEl.value || '').trim() : '';
    const search = searchRaw.toLowerCase();
    tbody.innerHTML = '';
    let merged = mergeProducts();
    if (search) {
      merged = merged.filter((p) => {
        const id = (p.id || '').toLowerCase();
        const title = (p.title || '').toLowerCase();
        const gtin = (p.gtin != null ? String(p.gtin) : '').toLowerCase();
        const batch = (p.batch != null ? String(p.batch) : '').toLowerCase();
        const bbd = (p.bbd != null ? String(p.bbd) : '').toLowerCase();
        const articleNo = (p.articleNo != null ? String(p.articleNo) : '').toLowerCase();
        return id.includes(search) || title.includes(search) || gtin.includes(search) || batch.includes(search) || bbd.includes(search) || articleNo.includes(search);
      });
    }
    merged.forEach((p) => {
      const tr = document.createElement('tr');
      const gtinVal = (p.gtin != null ? p.gtin : '') + '';
      const batchVal = (p.batch != null ? p.batch : '') + '';
      const bbdVal = (p.bbd != null ? p.bbd : '') + '';
      const articleNoVal = (p.articleNo != null ? p.articleNo : '') + '';
      const checked = p.inStock !== false;
      tr.innerHTML =
        '<td>' + escapeHtml(p.id) + '</td><td>' +
        escapeHtml((p.title || '').slice(0, 60)) + (p.title && p.title.length > 60 ? '...' : '') + '</td>' +
        '<td><input type="text" data-sku="' + escapeHtml(p.id) + '" data-field="gtin" value="' + escapeHtml(gtinVal) + '" placeholder="EAN/GTIN" /></td>' +
        '<td><input type="text" data-sku="' + escapeHtml(p.id) + '" data-field="batch" value="' + escapeHtml(batchVal) + '" placeholder="Batch" /></td>' +
        '<td><input type="text" data-sku="' + escapeHtml(p.id) + '" data-field="bbd" value="' + escapeHtml(bbdVal) + '" placeholder="BBD" title="Best Before Date" /></td>' +
        '<td><input type="text" data-sku="' + escapeHtml(p.id) + '" data-field="articleNo" value="' + escapeHtml(articleNoVal) + '" placeholder="Art. no" /></td>' +
        '<td><input type="checkbox" data-sku="' + escapeHtml(p.id) + '" data-field="inStock" ' + (checked ? 'checked' : '') + ' title="Uncheck if out of stock (line will be skipped on invoice)" /></td>' +
        '<td><input type="number" step="0.01" min="0" data-sku="' + escapeHtml(p.id) + '" data-field="price" value="' + (p.price === '' || p.price == null ? '' : p.price) + '" /></td>';
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  if (!api) return;

  document.getElementById('btnLoadSkuGuide').addEventListener('click', async () => {
    const result = await api.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePaths.length) return;
    skuGuidePath = result.filePaths[0];
    document.getElementById('skuGuidePath').textContent = skuGuidePath;
    const res = await api.readSkuGuide(skuGuidePath);
    if (res.error) {
      showMessage('prices', res.error, 'error');
      return;
    }
    products = res.products || [];
    config = await api.getConfig();
    // Merge CSV/guide prices and batch into config so the table shows them
    config.prices = config.prices || {};
    config.customProducts = config.customProducts || {};
    products.forEach((p) => {
      if (p.price != null && p.price !== '' && !isNaN(Number(p.price))) {
        config.prices[p.id] = Number(p.price);
      }
      if (p.batch != null && String(p.batch).trim() !== '') {
        config.customProducts[p.id] = { ...(config.customProducts[p.id] || {}), batch: String(p.batch).trim() };
      }
      if (p.bbd != null && String(p.bbd).trim() !== '') {
        config.customProducts[p.id] = { ...(config.customProducts[p.id] || {}), bbd: String(p.bbd).trim() };
      }
      if (p.articleNo != null && String(p.articleNo).trim() !== '') {
        config.customProducts[p.id] = { ...(config.customProducts[p.id] || {}), articleNo: String(p.articleNo).trim() };
      }
    });
    showMessage('prices', 'Loaded ' + products.length + ' products.', 'success');
    renderPricesTable();
  });

  document.getElementById('btnLoadDefaultCatalog').addEventListener('click', async () => {
    const res = await api.loadDefaultSkuGuide();
    if (res.error) {
      showMessage('prices', res.error, 'error');
      return;
    }
    products = res.products || [];
    skuGuidePath = await api.getDefaultSkuGuidePath();
    document.getElementById('skuGuidePath').textContent = '(Baby best food – ' + products.length + ' products)';
    config = await api.getConfig();
    showMessage('prices', 'Loaded Baby best food: ' + products.length + ' products.', 'success');
    renderPricesTable();
  });

  document.getElementById('btnAddSku').addEventListener('click', async () => {
    const id = document.getElementById('newSkuId').value.trim();
    const title = document.getElementById('newSkuTitle').value.trim();
    const gtin = document.getElementById('newSkuGtin').value.trim();
    const price = parseFloat(document.getElementById('newSkuPrice').value) || 0;
    if (!id) {
      showMessage('prices', 'Enter SKU ID.', 'error');
      return;
    }
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      config.customProducts = config.customProducts || {};
      const batch = document.getElementById('newSkuBatch').value.trim();
      const bbd = document.getElementById('newSkuBbd').value.trim();
      const articleNo = document.getElementById('newSkuArticleNo').value.trim();
      config.customProducts[id] = { title: title || id, gtin, batch, bbd: bbd || undefined, articleNo: articleNo || undefined };
      config.prices = config.prices || {};
      config.prices[id] = price;
      config = await api.saveConfig(config);
      document.getElementById('newSkuId').value = '';
      document.getElementById('newSkuTitle').value = '';
      document.getElementById('newSkuGtin').value = '';
      document.getElementById('newSkuBatch').value = '';
      document.getElementById('newSkuBbd').value = '';
      document.getElementById('newSkuArticleNo').value = '';
      document.getElementById('newSkuPrice').value = '';
      showMessage('prices', 'SKU added. Save prices to persist.', 'success');
      renderPricesTable();
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSavePrices').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      config.prices = config.prices || {};
      config.customProducts = config.customProducts || {};
      config.inStock = config.inStock || {};
      document.querySelectorAll('#pricesTable input[data-sku]').forEach((input) => {
        const sku = input.getAttribute('data-sku');
        const field = input.getAttribute('data-field');
        if (!sku) return;
        if (field === 'price') {
          const v = parseFloat(input.value);
          config.prices[sku] = isNaN(v) ? 0 : v;
        } else if (field === 'gtin') {
          const gtin = (input.value || '').trim();
          config.customProducts[sku] = { ...(config.customProducts[sku] || {}), gtin };
        } else if (field === 'batch') {
          const batch = (input.value || '').trim();
          config.customProducts[sku] = { ...(config.customProducts[sku] || {}), batch };
        } else if (field === 'bbd') {
          const bbd = (input.value || '').trim();
          config.customProducts[sku] = { ...(config.customProducts[sku] || {}), bbd: bbd || undefined };
        } else if (field === 'articleNo') {
          const articleNo = (input.value || '').trim();
          config.customProducts[sku] = { ...(config.customProducts[sku] || {}), articleNo: articleNo || undefined };
        } else if (field === 'inStock') {
          if (input.checked) delete config.inStock[sku]; else config.inStock[sku] = false;
        }
      });
      config = await api.saveConfig(config);
      showMessage('prices', 'Prices saved.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  const catalogSearchEl = document.getElementById('catalogSearch');
  if (catalogSearchEl) catalogSearchEl.addEventListener('input', () => renderPricesTable());

  function fillSenderForm(p) {
    if (!p) p = {};
    document.getElementById('senderName').value = p.name || '';
    document.getElementById('senderAddress').value = p.address || '';
    document.getElementById('senderVat').value = p.vatNumber || '';
    document.getElementById('senderCompanyCode').value = p.companyCode || '';
    document.getElementById('senderPhone').value = p.phone || '';
    document.getElementById('senderEmail').value = p.email || '';
    document.getElementById('senderCeo').value = p.ceo || '';
    document.getElementById('senderWebsite').value = p.website || '';
    document.getElementById('senderBankName').value = p.bankName || '';
    document.getElementById('senderBankAddress').value = p.bankAddress || '';
    document.getElementById('senderBankAccount').value = p.bankAccount || '';
    document.getElementById('senderSwift').value = p.swift || '';
    document.getElementById('senderLogoPath').value = p.logoPath || '';
  }

  function fillReceiverForm(p) {
    if (!p) p = {};
    document.getElementById('receiverName').value = p.name || '';
    document.getElementById('receiverAddress').value = p.address || '';
    document.getElementById('receiverVat').value = p.vatNumber || '';
  }

  function readSenderForm() {
    return {
      name: document.getElementById('senderName').value,
      address: document.getElementById('senderAddress').value,
      vatNumber: document.getElementById('senderVat').value,
      companyCode: document.getElementById('senderCompanyCode').value,
      phone: document.getElementById('senderPhone').value,
      email: document.getElementById('senderEmail').value,
      ceo: document.getElementById('senderCeo').value,
      website: document.getElementById('senderWebsite').value,
      bankName: document.getElementById('senderBankName').value,
      bankAddress: document.getElementById('senderBankAddress').value,
      bankAccount: document.getElementById('senderBankAccount').value,
      swift: document.getElementById('senderSwift').value,
      logoPath: document.getElementById('senderLogoPath').value.trim(),
    };
  }

  function readReceiverForm() {
    return {
      name: document.getElementById('receiverName').value,
      address: document.getElementById('receiverAddress').value,
      vatNumber: document.getElementById('receiverVat').value,
    };
  }

  async function loadConfigForSettings() {
    config = await api.getConfig();
    const senders = config.senderProfiles || [];
    const receivers = config.receiverProfiles || [];
    const selSender = document.getElementById('senderProfileSelect');
    const selReceiver = document.getElementById('receiverProfileSelect');
    selSender.innerHTML = '<option value="">— None —</option>' + senders.map((p) => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name || p.id) + '</option>').join('');
    selReceiver.innerHTML = '<option value="">— None —</option>' + receivers.map((p) => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name || p.id) + '</option>').join('');
    selSender.value = config.activeSenderId || '';
    selReceiver.value = config.activeReceiverId || '';
    const currentSender = senders.find((p) => p.id === config.activeSenderId);
    const currentReceiver = receivers.find((p) => p.id === config.activeReceiverId);
    fillSenderForm(currentSender);
    fillReceiverForm(currentReceiver);

    const inv = config.invoice || {};
    document.getElementById('invoiceCurrency').value = inv.currency || 'EUR';
    document.getElementById('invoicePrefix').value = inv.prefix || 'INV';
    document.getElementById('invoiceNextNumber').value = inv.nextNumber != null ? inv.nextNumber : 1;
    const saveDirEl = document.getElementById('invoiceSaveDirectory');
    if (saveDirEl) saveDirEl.value = (inv.saveDirectory != null ? inv.saveDirectory : '') || '';
    document.getElementById('invoicePaymentTerms').value = inv.paymentTerms || '';
    document.getElementById('invoiceDeliveryTerms').value = inv.deliveryTerms || '';
    document.getElementById('invoiceFooterNotes').value = inv.footerNotes || '';
    const tax = config.tax || {};
    document.getElementById('vatRate').value = tax.vatRatePercent != null ? tax.vatRatePercent : 20;
    document.getElementById('pricesIncludeVat').checked = !!tax.pricesIncludeVat;
    const ship = config.shipping || {};
    document.getElementById('shippingAmount').value = ship.fixedAmount != null ? ship.fixedAmount : 0;
  }

  document.querySelector('.tabs button[data-tab="settings"]').addEventListener('click', loadConfigForSettings);

  document.getElementById('senderProfileSelect').addEventListener('change', () => {
    const id = document.getElementById('senderProfileSelect').value;
    const p = (config.senderProfiles || []).find((s) => s.id === id);
    fillSenderForm(p);
  });
  document.getElementById('receiverProfileSelect').addEventListener('change', () => {
    const id = document.getElementById('receiverProfileSelect').value;
    const p = (config.receiverProfiles || []).find((r) => r.id === id);
    fillReceiverForm(p);
  });

  document.getElementById('btnNewSender').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      const id = 'sender-' + Date.now();
      const senders = config.senderProfiles || [];
      senders.push({ id, name: '', address: '', vatNumber: '', companyCode: '', phone: '', email: '', ceo: '', website: '', logoPath: '', bankName: '', bankAddress: '', bankAccount: '', swift: '' });
      config.senderProfiles = senders;
      config.activeSenderId = id;
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'New sender profile added. Fill in and save.', 'info');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSaveSender').addEventListener('click', async () => {
    const id = document.getElementById('senderProfileSelect').value;
    if (!id) { showMessage('settings', 'Select a sender to save, or create a new one.', 'error'); return; }
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      const senders = config.senderProfiles || [];
      const data = readSenderForm();
      const idx = senders.findIndex((p) => p.id === id);
      if (idx >= 0) {
        senders[idx] = { ...senders[idx], ...data };
      } else {
        senders.push({ id, ...data });
      }
      config.senderProfiles = senders;
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Sender profile saved.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSenderLogoBrowse').addEventListener('click', async () => {
    const result = await api.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return;
    document.getElementById('senderLogoPath').value = result.filePaths[0];
  });

  document.getElementById('btnInvoiceSaveDirBrowse').addEventListener('click', async () => {
    const result = await api.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return;
    document.getElementById('invoiceSaveDirectory').value = result.filePaths[0];
  });

  document.getElementById('btnDeleteSender').addEventListener('click', async () => {
    const id = document.getElementById('senderProfileSelect').value;
    if (!id) { showMessage('settings', 'Select a sender to delete.', 'error'); return; }
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      config.senderProfiles = (config.senderProfiles || []).filter((p) => p.id !== id);
      if (config.activeSenderId === id) config.activeSenderId = (config.senderProfiles[0] && config.senderProfiles[0].id) || '';
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Sender profile deleted.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnNewReceiver').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      const id = 'receiver-' + Date.now();
      const receivers = config.receiverProfiles || [];
      receivers.push({ id, name: '', address: '', vatNumber: '' });
      config.receiverProfiles = receivers;
      config.activeReceiverId = id;
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'New receiver profile added. Fill in and save.', 'info');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSaveReceiver').addEventListener('click', async () => {
    const id = document.getElementById('receiverProfileSelect').value;
    if (!id) { showMessage('settings', 'Select a receiver to save, or create a new one.', 'error'); return; }
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      const receivers = config.receiverProfiles || [];
      const data = readReceiverForm();
      const idx = receivers.findIndex((p) => p.id === id);
      if (idx >= 0) {
        receivers[idx] = { ...receivers[idx], ...data };
      } else {
        receivers.push({ id, ...data });
      }
      config.receiverProfiles = receivers;
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Receiver profile saved.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnDeleteReceiver').addEventListener('click', async () => {
    const id = document.getElementById('receiverProfileSelect').value;
    if (!id) { showMessage('settings', 'Select a receiver to delete.', 'error'); return; }
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      config.receiverProfiles = (config.receiverProfiles || []).filter((p) => p.id !== id);
      if (config.activeReceiverId === id) config.activeReceiverId = (config.receiverProfiles[0] && config.receiverProfiles[0].id) || '';
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Receiver profile deleted.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  const SAMPLE_SENDER = {
    id: 'sample-viola',
    name: 'Viola Warenhandels- und Vertriebs-GmbH & Co. KG',
    address: 'Köttgenstraße 6, 13629 Berlin',
    vatNumber: 'DE123456789',
    companyCode: 'HRA 12345',
    phone: '+49 (0) 1516 2763447',
    email: 'info@violawholesale.com',
    ceo: 'Adrian de los Mozos Martinez',
    website: 'www.violawholesale.com',
    bankName: 'Berliner Sparkasse',
    bankAddress: 'Wilmersdorfer Straße 57, 10627 Berlin',
    bankAccount: 'DE64 1005 0000 0191 1171 29',
    swift: 'BELADEBEXXX',
  };
  const SAMPLE_RECEIVER = {
    id: 'sample-baby',
    name: "Baby's Best Food GmbH",
    address: 'Bismarckstr. 63-64, Lise-Meitner-Str. 39/41, 10627 Berlin',
    vatNumber: 'DE327328168',
  };

  document.getElementById('btnLoadSample').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      if (!config) config = await api.getConfig();
      const senders = config.senderProfiles || [];
      const receivers = config.receiverProfiles || [];
      if (!senders.find((p) => p.id === SAMPLE_SENDER.id)) senders.push(SAMPLE_SENDER);
      if (!receivers.find((p) => p.id === SAMPLE_RECEIVER.id)) receivers.push(SAMPLE_RECEIVER);
      config.senderProfiles = senders;
      config.receiverProfiles = receivers;
      config.activeSenderId = SAMPLE_SENDER.id;
      config.activeReceiverId = SAMPLE_RECEIVER.id;
      config.invoice = { ...config.invoice, currency: 'EUR', prefix: 'PF', paymentTerms: '100% Vorkasse', deliveryTerms: 'Frei Haus - Berlin', footerNotes: 'Thank you for your business. Please pay by the due date.' };
      config.tax = { ...config.tax, vatRatePercent: 7, pricesIncludeVat: false };
      config.shipping = { ...config.shipping, mode: 'fixed', fixedAmount: 0 };
      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Sample sender and receiver profiles added and selected.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSaveSettings').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      const activeSenderId = document.getElementById('senderProfileSelect').value;
      const activeReceiverId = document.getElementById('receiverProfileSelect').value;
      const invoice = {
        currency: document.getElementById('invoiceCurrency').value || 'EUR',
        prefix: document.getElementById('invoicePrefix').value || 'INV',
        nextNumber: parseInt(document.getElementById('invoiceNextNumber').value, 10) || 1,
        saveDirectory: (document.getElementById('invoiceSaveDirectory') && document.getElementById('invoiceSaveDirectory').value) ? document.getElementById('invoiceSaveDirectory').value.trim() : '',
        paymentTerms: document.getElementById('invoicePaymentTerms').value,
        deliveryTerms: document.getElementById('invoiceDeliveryTerms').value,
        footerNotes: document.getElementById('invoiceFooterNotes').value,
      };
      const tax = {
        vatRatePercent: parseFloat(document.getElementById('vatRate').value) || 0,
        pricesIncludeVat: document.getElementById('pricesIncludeVat').checked,
      };
      const shipping = {
        mode: 'fixed',
        fixedAmount: parseFloat(document.getElementById('shippingAmount').value) || 0,
      };

      if (!config) config = await api.getConfig();
      config.activeSenderId = activeSenderId || '';
      config.activeReceiverId = activeReceiverId || '';
      config.invoice = { ...config.invoice, ...invoice };
      config.tax = { ...config.tax, ...tax };
      config.shipping = { ...config.shipping, ...shipping };

      const senders = config.senderProfiles || [];
      if (activeSenderId) {
        const senderData = readSenderForm();
        const si = senders.findIndex((p) => p.id === activeSenderId);
        if (si >= 0) senders[si] = { ...senders[si], ...senderData };
      }
      if (activeReceiverId) {
        const receiverData = readReceiverForm();
        const ri = (config.receiverProfiles || []).findIndex((p) => p.id === activeReceiverId);
        const receivers = config.receiverProfiles || [];
        if (ri >= 0) receivers[ri] = { ...receivers[ri], ...receiverData };
        config.receiverProfiles = receivers;
      }
      config.senderProfiles = senders;

      config = await api.saveConfig(config);
      loadConfigForSettings();
      showMessage('settings', 'Settings saved.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnResetConfig').addEventListener('click', async () => {
    showSaveSpinner();
    try {
      config = await api.resetConfigToDefault();
      loadConfigForSettings();
      showMessage('settings', 'Config reset to default.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnLoadConfig').addEventListener('click', async () => {
    const result = await api.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths.length) return;
    showSaveSpinner();
    try {
      config = await api.loadConfigFile(result.filePaths[0]);
      if (!config) {
        showMessage('settings', 'Failed to load config.', 'error');
        return;
      }
      loadConfigForSettings();
      showMessage('settings', 'Config loaded and set as main.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnSaveConfigAs').addEventListener('click', async () => {
    if (!config) config = await api.getConfig();
    const result = await api.showSaveDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: 'config_' + new Date().toISOString().slice(0, 10) + '.json' });
    if (result.canceled || !result.filePath) return;
    showSaveSpinner();
    try {
      await api.saveConfigAs(result.filePath, config);
      showMessage('settings', 'Config saved to file.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  function applyPacklistResult(ordersList, pathOrLabel) {
    orders = ordersList || [];
    packlistPath = pathOrLabel || '';
    document.getElementById('packlistPath').textContent = pathOrLabel ? pathOrLabel : '';
    const preview = document.getElementById('ordersPreview');
    const summary = '<div class="orders-summary">' + orders.length + ' order' + (orders.length !== 1 ? 's' : '') + '</div>';
    const tableRows = orders.map((o, i) => {
      const name = escapeHtml(o.name || '—');
      const tracking = escapeHtml(o.tracking || '—');
      const lineCount = o.lines ? o.lines.length : 0;
      return '<tr><td class="orders-num">' + (i + 1) + '</td><td class="orders-name">' + name + '</td><td class="orders-tracking">' + tracking + '</td><td class="orders-lines">' + lineCount + '</td></tr>';
    }).join('');
    preview.innerHTML = summary +
      '<table class="orders-table"><thead><tr><th>#</th><th>Customer</th><th>Tracking</th><th>Items</th></tr></thead><tbody>' + tableRows + '</tbody></table>';
  }

  document.getElementById('btnLoadPacklist').addEventListener('click', async () => {
    const result = await api.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePaths.length) return;
    const res = await api.readPacklist(result.filePaths[0]);
    if (res.error) {
      showMessage('packlist', res.error, 'error');
      return;
    }
    applyPacklistResult(res.orders, result.filePaths[0]);
    showMessage('packlist', 'Loaded ' + orders.length + ' orders.', 'success');
  });

  const dropZone = document.getElementById('packlistDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (!files.length) return;
      const file = files[0];
      const name = (file.name || '').toLowerCase();
      if (!name.endsWith('.csv')) {
        showMessage('packlist', 'Please drop a CSV file.', 'error');
        return;
      }
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
      const res = await api.parsePacklistContent(text);
      if (res.error) {
        showMessage('packlist', res.error, 'error');
        return;
      }
      applyPacklistResult(res.orders, '(dropped) ' + file.name);
      showMessage('packlist', 'Loaded ' + orders.length + ' orders from drop.', 'success');
    });
  }

  document.getElementById('btnPreviewPdf').addEventListener('click', async () => {
    if (!orders.length) {
      showMessage('packlist', 'Load a packlist first.', 'error');
      return;
    }
    showSaveSpinner('Generating…');
    try {
      config = await api.getConfig();
      config.invoice = config.invoice || {};
      config.invoice.batchNumber = (document.getElementById('packlistBatchNumber') && document.getElementById('packlistBatchNumber').value) ? document.getElementById('packlistBatchNumber').value.trim() : '';
      const res = await api.generatePdf({
        orders,
        config,
        skuGuidePath: skuGuidePath || undefined,
        preview: true,
      });
      if (res.error) {
        showMessage('packlist', res.error, 'error');
        return;
      }
      await api.saveConfig(config);
      showMessage('packlist', 'Preview opened in your default PDF viewer.', 'success');
    } finally {
      hideSaveSpinner();
    }
  });

  document.getElementById('btnGeneratePdf').addEventListener('click', async () => {
    if (!orders.length) {
      showMessage('packlist', 'Load a packlist first.', 'error');
      return;
    }
    showSaveSpinner('Generating…');
    try {
      config = await api.getConfig();
      config.invoice = config.invoice || {};
      config.invoice.batchNumber = (document.getElementById('packlistBatchNumber') && document.getElementById('packlistBatchNumber').value) ? document.getElementById('packlistBatchNumber').value.trim() : '';
      const inv = config.invoice || {};
      const prefix = (inv.prefix || 'INV').trim() || 'INV';
      const year = new Date().getFullYear();
      const nextNum = inv.nextNumber != null ? parseInt(inv.nextNumber, 10) : 1;
      const defaultFilename = prefix + '-' + year + '-' + String(nextNum).padStart(5, '0') + '.pdf';
      let outputPath;
      if (inv.saveDirectory && inv.saveDirectory.trim()) {
        outputPath = await api.getDefaultInvoicePath(inv.saveDirectory.trim(), defaultFilename);
      } else {
        const result = await api.showSaveDialog({
          defaultPath: defaultFilename,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (result.canceled || !result.filePath) return;
        outputPath = result.filePath;
      }
      const res = await api.generatePdf({
        orders,
        config,
        skuGuidePath: skuGuidePath || undefined,
        outputPath,
      });
      if (res.error) {
        showMessage('packlist', res.error, 'error');
        return;
      }
      config = await api.getConfig();
      showMessage('packlist', 'PDF saved: ' + res.path, 'success');
      if (typeof renderInvoiceHistory === 'function') renderInvoiceHistory();
    } finally {
      hideSaveSpinner();
    }
  });

  const btnPreviewTop = document.getElementById('btnPreviewPdfTop');
  const btnGenerateTop = document.getElementById('btnGeneratePdfTop');
  if (btnPreviewTop) btnPreviewTop.addEventListener('click', () => document.getElementById('btnPreviewPdf').click());
  if (btnGenerateTop) btnGenerateTop.addEventListener('click', () => document.getElementById('btnGeneratePdf').click());

  switchTab('prices');
  (async function init() {
    config = await api.getConfig();
    const res = await api.loadDefaultSkuGuide();
    if (!res.error && res.products && res.products.length) {
      products = res.products;
      skuGuidePath = await api.getDefaultSkuGuidePath();
      document.getElementById('skuGuidePath').textContent = '(Baby best food – ' + products.length + ' products)';
    } else if (config.customProducts && Object.keys(config.customProducts).length) {
      products = Object.entries(config.customProducts).map(([id, p]) => ({ id, gtin: p.gtin || '', title: p.title || id, batch: p.batch, bbd: p.bbd, articleNo: p.articleNo || '' }));
      document.getElementById('skuGuidePath').textContent = '(custom products only)';
    }
    renderPricesTable();
  })();
})();
