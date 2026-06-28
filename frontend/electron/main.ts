import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fork } from 'child_process';

// Opcional: iniciar o backend localmente junto com o frontend
let backendProcess: any = null;

function startBackend() {
  const backendPath = path.join(__dirname, '../../backend/dist/index.js');
  console.log('Iniciando backend local...', backendPath);
  try {
    backendProcess = fork(backendPath, [], {
      cwd: path.join(__dirname, '../../backend'),
      env: process.env
    });

    backendProcess.on('error', (err: any) => {
      console.error('Erro ao iniciar o backend:', err);
    });

    backendProcess.on('exit', (code: number) => {
      console.log(`Backend local encerrou com código ${code}`);
    });
  } catch (error) {
    console.error('Não foi possível iniciar o backend local:', error);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'OpenClaw OS',
    icon: path.join(__dirname, '../public/vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: true,
      contextIsolation: false, // Permitir que o web app chame coisas locais
    },
  });

  // Em dev, carrega via Vite server
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    // Em produção, carrega o index.html compilado
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Opcional: Iniciar o backend Express local
  // startBackend();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) {
      backendProcess.kill();
    }
    app.quit();
  }
});
