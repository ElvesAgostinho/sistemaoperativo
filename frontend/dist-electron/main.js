import { BrowserWindow as e, app as t } from "electron";
import n from "path";
//#region electron/main.ts
function r() {
	let t = new e({
		width: 1200,
		height: 800,
		title: "OpenClaw OS",
		icon: n.join(__dirname, "../public/vite.svg"),
		webPreferences: {
			preload: n.join(__dirname, "preload.mjs"),
			nodeIntegration: !0,
			contextIsolation: !1
		}
	});
	process.env.VITE_DEV_SERVER_URL ? t.loadURL(process.env.VITE_DEV_SERVER_URL) : t.loadFile(n.join(__dirname, "../dist/index.html"));
}
t.whenReady().then(() => {
	r(), t.on("activate", () => {
		e.getAllWindows().length === 0 && r();
	});
}), t.on("window-all-closed", () => {
	process.platform !== "darwin" && t.quit();
});
//#endregion
export {};
