const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  license: {
    check: () => ipcRenderer.invoke('license:check'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    trial: (data) => ipcRenderer.invoke('license:trial', data),
    current: () => ipcRenderer.invoke('license:current'),
    signOut: () => ipcRenderer.invoke('license:signOut'),
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  data: {
    getAll: () => ipcRenderer.invoke('data:getAll'),
    setLeads: (leads) => ipcRenderer.invoke('data:setLeads', leads),
    updateLead: (id, patch) => ipcRenderer.invoke('data:updateLead', id, patch),
    setTemplates: (templates) => ipcRenderer.invoke('data:setTemplates', templates),
    setSettings: (settings) => ipcRenderer.invoke('data:setSettings', settings),
    setSendQueue: (queue) => ipcRenderer.invoke('data:setSendQueue', queue),
    incrementContacted: () => ipcRenderer.invoke('data:incrementContacted'),
    openFolder: () => ipcRenderer.invoke('data:openFolder'),
  },
  instagram: {
    setBounds: (bounds) => ipcRenderer.invoke('instagram:setBounds', bounds),
    navigate: (url) => ipcRenderer.invoke('instagram:navigate', url),
    back: () => ipcRenderer.invoke('instagram:back'),
    reload: () => ipcRenderer.invoke('instagram:reload'),
    getUrl: () => ipcRenderer.invoke('instagram:getUrl'),
    context: () => ipcRenderer.invoke('instagram:context'),
    capture: () => ipcRenderer.invoke('instagram:capture'),
    enrichCurrentProfile: () => ipcRenderer.invoke('instagram:enrichCurrentProfile'),
    insertTemplate: (text) => ipcRenderer.invoke('instagram:insertTemplate', text),
    onNavigated: (callback) => {
      const listener = (_event, url) => callback(url);
      ipcRenderer.on('instagram:navigated', listener);
      return () => ipcRenderer.removeListener('instagram:navigated', listener);
    },
  },
  groq: {
    models: (apiKey) => ipcRenderer.invoke('groq:models', apiKey),
    score: (leads) => ipcRenderer.invoke('groq:score', leads),
    personalize: (lead, baseTemplate) => ipcRenderer.invoke('groq:personalize', lead, baseTemplate),
  },
});
