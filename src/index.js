// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const csv = require('csv-parse')
const ExifImage = require('exif').ExifImage

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile(path.join(__dirname, 'index.html'));
  // // Open the DevTools.
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow)

// Handle CSV file selection
ipcMain.handle('select-csv', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  
  if (!result.canceled) {
    const csvPath = result.filePaths[0]
    const csvContent = await fs.readFile(csvPath, 'utf-8')
    
    return new Promise((resolve, reject) => {
      csv.parse(csvContent, { columns: true }, (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
  }
  return null
})

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  
  if (!result.canceled) {
    return result.filePaths[0]
  }
  return null
})

// Get EXIF data from image
async function getImageDate(imagePath) {
  return new Promise((resolve, reject) => {
    new ExifImage({ image: imagePath }, (error, exifData) => {
      if (error) {
        resolve(null) // Return null if no EXIF data
      } else {
        const dateTimeOriginal = exifData.exif.DateTimeOriginal
        resolve(dateTimeOriginal ? new Date(dateTimeOriginal) : null)
      }
    })
  })
}

// Handle renaming process
ipcMain.handle('rename-files', async (event, { folderPath, csvData }) => {
  try {
    // Get all image files from the folder
    const files = await fs.readdir(folderPath)
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file))
    
    // Get dates for all images
    const imageData = await Promise.all(
      imageFiles.map(async file => {
        const fullPath = path.join(folderPath, file)
        const date = await getImageDate(fullPath)
        return { file, date, fullPath }
      })
    )
    
    // Sort images by date
    const sortedImages = imageData
      .filter(img => img.date) // Only include images with valid dates
      .sort((a, b) => a.date - b.date)
    
    // Rename files
    for (let i = 0; i < Math.min(sortedImages.length, csvData.length); i++) {
      const newName = csvData[i].FileName + ".jpg"
      const oldPath = sortedImages[i].fullPath
      const newPath = path.join(folderPath, newName)
      
      await fs.rename(oldPath, newPath)
    }
    
    return {
      success: true,
      message: `Renamed ${Math.min(sortedImages.length, csvData.length)} files`
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})