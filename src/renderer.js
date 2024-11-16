const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const exif = require('exif-parser');

const { dialog } = require('electron');  // Now you can use dialog directly

// CSV Selection
document.getElementById('select-csv').onclick = () => {
  dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  }).then(result => {
    if (result.filePaths && result.filePaths.length > 0) {
      document.getElementById('csv-path').innerText = result.filePaths[0];
    }
  }).catch(err => {
    console.error('Error opening CSV file dialog:', err);
  });
};

// Folder Selection
document.getElementById('select-folder').onclick = () => {
  dialog.showOpenDialog({
    properties: ['openDirectory']
  }).then(result => {
    if (result.filePaths && result.filePaths.length > 0) {
      document.getElementById('folder-path').innerText = result.filePaths[0];
    }
  }).catch(err => {
    console.error('Error opening folder dialog:', err);
  });
};

// Start Process
document.getElementById('start-process').onclick = () => {
  const csvPath = document.getElementById('csv-path').innerText;
  const folderPath = document.getElementById('folder-path').innerText;

  if (!csvPath || !folderPath) {
    alert('Please select both a CSV file and a folder.');
    return;
  }

  // Step 1: Read the CSV file to get filenames
  let fileNames = [];
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      fileNames.push(row.FileName);
    })
    .on('end', () => {
      // Step 2: Process images and rename them based on the CSV data
      const images = fs.readdirSync(folderPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file)).map(file => {
        const filePath = path.join(folderPath, file);
        const buffer = fs.readFileSync(filePath);
        const parser = exif.create(buffer);
        const result = parser.parse();
        return { filePath, dateTaken: result.tags.DateTimeOriginal };
      }).sort((a, b) => a.dateTaken - b.dateTaken);

      // Rename images based on CSV data
      images.forEach((image, index) => {
        if (fileNames[index]) {
          const newFilePath = path.join(folderPath, `${fileNames[index]}${path.extname(image.filePath)}`);
          fs.renameSync(image.filePath, newFilePath);
          console.log(`Renamed ${image.filePath} to ${newFilePath}`);
        }
      });

      alert('Process complete!');
    });
};
