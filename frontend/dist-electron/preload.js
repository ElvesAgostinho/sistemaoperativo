import { contextBridge as e } from "electron";
//#region electron/preload.ts
e.exposeInMainWorld("electronAPI", {});
//#endregion
export {};
