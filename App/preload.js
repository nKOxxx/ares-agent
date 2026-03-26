const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('hermes', {
  platform: process.platform,
  version: '3.0.0',
});
