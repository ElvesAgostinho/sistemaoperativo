import { ipcRenderer, contextBridge } from 'electron';

// Expose safe APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Você pode adicionar métodos seguros aqui, ex: 
  // sendMessage: (msg: string) => ipcRenderer.send('message', msg)
});
