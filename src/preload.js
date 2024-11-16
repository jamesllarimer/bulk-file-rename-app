const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nodeAPI", {
  // Function to open file/folder dialogs
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),
});

