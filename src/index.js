// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const csv = require('csv-parse')
const ExifImage = require('exif').ExifImage
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool();

// Update valid file extensions to include ARW
const VALID_EXTENSIONS = /\.(jpg|jpeg|png|arw)$/i

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile(path.join(__dirname, 'index.html'));
    // Open the DevTools.
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow)

// Handle CSV file selection with improved validation
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
        // Filter out rows where FileName is empty or only whitespace
        const validRows = data.filter(row => 
          row.FileName && 
          row.FileName.trim().length > 0 &&
          Object.values(row).some(value => value && value.trim().length > 0)
        )
        resolve(validRows)
      })
    })
  }
  return null
})

// Handle folder selection with ARW support
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  
  if (!result.canceled) {
    const folderPath = result.filePaths[0]
    const files = await fs.readdir(folderPath)
    const imageFiles = files.filter(file => VALID_EXTENSIONS.test(file))
    
    return {
      path: folderPath,
      imageCount: imageFiles.length,
      fileTypes: getFileTypeSummary(imageFiles)
    }
  }
  return null
})

// Helper function to summarize file types
function getFileTypeSummary(files) {
  const summary = files.reduce((acc, file) => {
    const ext = path.extname(file).toLowerCase()
    acc[ext] = (acc[ext] || 0) + 1
    return acc
  }, {})
  return summary
}

// Get EXIF data and prepare preview data
ipcMain.handle('prepare-preview', async (event, { folderPath }) => {
  try {
    const files = await fs.readdir(folderPath)
    const imageFiles = files.filter(file => VALID_EXTENSIONS.test(file))
    
    const imageData = await Promise.all(
      imageFiles.map(async file => {
        const fullPath = path.join(folderPath, file)
        const date = await getImageDate(fullPath)
        const stats = await fs.stat(fullPath)
        const fileType = path.extname(file).toLowerCase()
        
        return {
          file,
          originalName: file,
          path: fullPath,
          date: date || stats.mtime,
          size: stats.size,
          fileType
        }
      })
    )
    
    return imageData.sort((a, b) => a.date - b.date)
  } catch (error) {
    return {
      error: error.message
    }
  }
})

// Updated EXIF reader to handle ARW files
async function getImageDate(imagePath) {
  return new Promise((resolve, reject) => {
    new ExifImage({ image: imagePath }, (error, exifData) => {
      if (error) {
        resolve(null)
      } else {
        const dateTimeOriginal = exifData.exif.DateTimeOriginal
        resolve(dateTimeOriginal ? new Date(dateTimeOriginal) : null)
      }
    })
  })
}
ipcMain.handle('select-image', () => {
  return dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'arw', 'cr2', 'nef'] }
    ]
  });
});

ipcMain.handle('get-image-metadata', async (event, filepath) => {
  try {
    const metadata = await exiftool.read(filepath);
    const dateTimeMetadata = {};

    // Filter metadata to include only date and time information
    Object.entries(metadata).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([subKey, subValue]) => {
          if (subValue instanceof Date || !isNaN(Date.parse(subValue))) {
            if (!dateTimeMetadata[key]) {
              dateTimeMetadata[key] = {};
            }
            dateTimeMetadata[key][subKey] = new Date(subValue).toLocaleString();
          }
        });
      } else if (value instanceof Date || !isNaN(Date.parse(value))) {
        dateTimeMetadata[key] = new Date(value).toLocaleString();
      }
    });

    return dateTimeMetadata;
  } catch (error) {
    console.error('Error reading metadata:', error);
    throw error;
  }
});

// / Handle renaming process
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