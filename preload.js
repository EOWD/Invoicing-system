const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('invoicing', {
  readSkuGuide: (path) => ipcRenderer.invoke('read-sku-guide', path),
  loadDefaultSkuGuide: () => ipcRenderer.invoke('load-default-sku-guide'),
  getDefaultSkuGuidePath: () => ipcRenderer.invoke('get-default-sku-guide-path'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  resetConfigToDefault: () => ipcRenderer.invoke('reset-config-to-default'),
  loadConfigFile: (filePath) => ipcRenderer.invoke('load-config-file', filePath),
  saveConfigAs: (filePath, config) => ipcRenderer.invoke('save-config-as', { filePath, config }),
  readPacklist: (path) => ipcRenderer.invoke('read-packlist', path),
  parsePacklistContent: (csvContent) => ipcRenderer.invoke('parse-packlist-content', csvContent),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  generatePdf: (opts) => ipcRenderer.invoke('generate-pdf', opts),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  getDefaultInvoicePath: (saveDir, filename) => ipcRenderer.invoke('get-default-invoice-path', { saveDir, filename }),
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const el = document.getElementById(selector);
    if (el) el.innerText = text;
  };
  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
