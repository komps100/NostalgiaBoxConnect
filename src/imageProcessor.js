const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { ProcessedFilesLog } = require('./processedFilesLog');

class ImageProcessor {
  constructor(logger, outputFolder = null, watchFolder = null) {
    this.logger = logger;
    this.queue = [];
    this.processing = false;
    this.outputFolder = outputFolder;
    this.watchFolder = watchFolder;
    this.processedLog = null;

    if (watchFolder) {
      this.processedLog = new ProcessedFilesLog(watchFolder);
    }
  }

  setOutputFolder(folder) {
    this.outputFolder = folder;
  }

  setWatchFolder(folder) {
    this.watchFolder = folder;
    this.processedLog = new ProcessedFilesLog(folder);
  }

  async isGroupProcessed(imagePaths) {
    if (!this.processedLog) return false;
    return await this.processedLog.isGroupProcessed(imagePaths);
  }

  async addToQueue(images) {
    this.queue.push(images);
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const images = this.queue.shift();

    try {
      await this.stitchImages(images);
    } catch (error) {
      this.logger.error(`Failed to process images: ${error.message}`);
    }

    this.processQueue();
  }

  generateOutputFilename(imagePaths) {
    if (imagePaths.length === 0) return 'stitched';

    // Get the directory of the first image
    const firstImageDir = path.dirname(imagePaths[0]);
    const folderName = path.basename(firstImageDir);

    // If we have a meaningful folder name (not just root or generic names), use it
    if (folderName &&
        folderName !== '.' &&
        folderName !== '..' &&
        folderName !== 'Desktop' &&
        folderName !== 'Pictures' &&
        folderName !== 'Documents' &&
        !folderName.includes('Processed')) {
      return folderName;
    }

    // Otherwise, use smart processing of the first filename
    const firstFileName = path.basename(imagePaths[0], path.extname(imagePaths[0]));

    // Check for date pattern YYYYMMDD
    const dateMatch = firstFileName.match(/(\d{8})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const beforeDate = firstFileName.substring(0, dateMatch.index);
      const afterDate = firstFileName.substring(dateMatch.index + 8);

      return `${beforeDate}${dateStr}_processed${afterDate}`;
    }

    // No date found, just add _processed to the end
    return `${firstFileName}_processed`;
  }

  async stitchImages(imagePaths) {
    const count = imagePaths.length;
    if (count < 2 || count > 6) {
      this.logger.warn(`Invalid number of images: ${count}. Expected 2-6.`);
      return;
    }

    // Sort images alphabetically by filename
    imagePaths.sort((a, b) => {
      const nameA = path.basename(a).toLowerCase();
      const nameB = path.basename(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    this.logger.info(`Processing ${count} images for stitching (sorted alphabetically)`);
    this.logger.info(`Image order: ${imagePaths.map(p => path.basename(p)).join(', ')}`);

    try {
      // IMPORTANT: We're only reading the images, never modifying originals
      const images = await Promise.all(
        imagePaths.map(async (imgPath) => {
          const img = sharp(imgPath);
          const metadata = await img.metadata();
          return { path: imgPath, sharp: img, metadata };
        })
      );

      const layout = this.getGridLayout(count);
      const stitched = await this.createStitchedImage(images, layout);

      // Determine output directory
      let outputDir;
      if (this.outputFolder) {
        outputDir = this.outputFolder;
      } else {
        outputDir = path.join(path.dirname(imagePaths[0]), 'Processed');
      }

      await fs.mkdir(outputDir, { recursive: true });

      // Generate filename based on folder or smart file naming
      const baseName = this.generateOutputFilename(imagePaths);
      const outputPath = path.join(outputDir, `${baseName}.jpg`);

      await stitched.toFile(outputPath);

      // Mark as processed in log
      if (this.processedLog) {
        await this.processedLog.markAsProcessed(imagePaths, outputPath);
      }

      this.logger.info(`Successfully stitched ${count} images to: ${outputPath}`);

      if (global.sendStatusUpdate) {
        global.sendStatusUpdate({
          message: `Stitched ${count} images successfully`,
          timestamp: new Date().toISOString(),
          outputPath
        });
      }

    } catch (error) {
      this.logger.error(`Error stitching images: ${error.message}`);
      throw error;
    }
  }

  getGridLayout(count) {
    const layouts = {
      2: { cols: 2, rows: 1, positions: [[0, 0], [1, 0]] },
      3: { cols: 2, rows: 2, positions: [[0, 0], [1, 0], [0.5, 1]] },
      4: { cols: 2, rows: 2, positions: [[0, 0], [1, 0], [0, 1], [1, 1]] },
      5: { cols: 3, rows: 2, positions: [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1]] },
      6: { cols: 3, rows: 2, positions: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }
    };
    return layouts[count];
  }

  async createStitchedImage(images, layout) {
    const maxWidth = Math.max(...images.map(img => img.metadata.width));
    const maxHeight = Math.max(...images.map(img => img.metadata.height));

    const cellWidth = maxWidth;
    const cellHeight = maxHeight;

    const canvasWidth = cellWidth * layout.cols;
    const canvasHeight = cellHeight * layout.rows;

    // Use black background for odd number of images, white for even
    const imageCount = images.length;
    const isOddCount = imageCount % 2 === 1;
    const backgroundColor = isOddCount
      ? { r: 0, g: 0, b: 0 }      // Black for odd numbers (3, 5)
      : { r: 255, g: 255, b: 255 }; // White for even numbers (2, 4, 6)

    const composites = await Promise.all(
      images.map(async (img, index) => {
        const position = layout.positions[index];
        const x = Math.floor(position[0] * cellWidth);
        const y = Math.floor(position[1] * cellHeight);

        const buffer = await img.sharp.toBuffer();

        return {
          input: buffer,
          left: x,
          top: y
        };
      })
    );

    return sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: backgroundColor
      }
    })
    .composite(composites)
    .jpeg({ quality: 100 });
  }
}

module.exports = { ImageProcessor };
