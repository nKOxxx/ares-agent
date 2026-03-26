const { app, BrowserWindow, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const { start, PORT } = require('./backend/server');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Hermes',
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // In development, load from Vite dev server; in production, from built files
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL(`http://localhost:5173`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAADRJREFUOI1jYBhowEjh//8GBgYGBobmpsb/DAwMDAwcnFwMDAwMDP///2dgYGBg+P+fYcABAGfZCAdBiVYRAAAAAElFTkSuQmCC'
  );
  tray = new Tray(icon);
  tray.setToolTip('Hermes');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(async () => {
  // Start backend server
  await start();
  console.log(`[Hermes] Backend ready on port ${PORT}`);

  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('[Hermes] Shutting down...');
});
