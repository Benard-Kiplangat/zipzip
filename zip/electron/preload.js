const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  allDocs: (options = {}) => ipcRenderer.invoke('bosco:db:allDocs', options),
  get: (id, options = {}) => ipcRenderer.invoke('bosco:db:get', id, options),
  put: (doc) => ipcRenderer.invoke('bosco:db:put', doc),
  remove: (doc) => ipcRenderer.invoke('bosco:db:remove', doc),
  seedSyncChanges: (startDate) =>
    ipcRenderer.invoke('bosco:db:seedSyncChanges', startDate),
  getPendingSyncChanges: (limit, startDate) =>
    ipcRenderer.invoke('bosco:db:getPendingSyncChanges', limit, startDate),
  queueSyncDoc: (doc) => ipcRenderer.invoke('bosco:db:queueSyncDoc', doc),
  markSyncChangeSynced: (id, updatedAt) =>
    ipcRenderer.invoke('bosco:db:markSyncChangeSynced', id, updatedAt),
  applyRemoteSyncDoc: (doc) => ipcRenderer.invoke('bosco:db:applyRemoteSyncDoc', doc),
  getSyncState: (key) => ipcRenderer.invoke('bosco:db:getSyncState', key),
  setSyncState: (key, value) => ipcRenderer.invoke('bosco:db:setSyncState', key, value),
  acknowledgeSyncBaseline: (key, value) =>
    ipcRenderer.invoke('bosco:db:acknowledgeSyncBaseline', key, value),
  destroy: () => ipcRenderer.invoke('bosco:db:destroy'),
  resetDb: () => ipcRenderer.invoke('bosco:db:resetDb'),
  hardRefresh: () => ipcRenderer.invoke('bosco:app:hardRefresh'),
  createBackup: () => ipcRenderer.invoke("bosco:backup:create"),
  restoreBackup: () => ipcRenderer.invoke("bosco:backup:restore"),
});
