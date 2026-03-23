const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backend;

function startBackend() {
    const serverPath = path.join(__dirname, 'backend', 'server.js');
    console.log('[main] Starting backend:', serverPath);
    
    backend = spawn('node', [serverPath], {
        stdio: 'inherit',
        detached: true,
        env: { ...process.env }
    });
    
    backend.on('error', err => {
        console.error('[main] Backend error:', err);
    });
    
    backend.on('exit', (code) => {
        console.log('[main] Backend exited with code:', code);
    });
}

function createWindow() {
    console.log('[main] Creating window');
    
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: '⚡ ARES Agent',
        backgroundColor: '#09090b',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    
    // Open DevTools in development
    // mainWindow.webContents.openDevTools();
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    console.log('[main] App ready');
    startBackend();
    // Wait for backend to initialize
    setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
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
    console.log('[main] Quitting, killing backend');
    if (backend) {
        try {
            process.kill(backend.pid, 'SIGTERM');
        } catch (e) {
            console.error('[main] Failed to kill backend:', e.message);
        }
    }
});
