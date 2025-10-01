const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ProcessedFilesLog {
  constructor(watchFolder) {
    this.watchFolder = watchFolder;
    this.logFile = path.join(watchFolder, '.processed_groups.json');
    this.data = null;
  }

  async load() {
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      this.data = JSON.parse(content);
    } catch (error) {
      this.data = { groups: {} };
    }
  }

  async save() {
    await fs.writeFile(this.logFile, JSON.stringify(this.data, null, 2));
  }

  generateGroupHash(imagePaths) {
    const sortedPaths = [...imagePaths].sort();
    const combined = sortedPaths.join('|');
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  async isGroupProcessed(imagePaths) {
    if (!this.data) await this.load();
    const hash = this.generateGroupHash(imagePaths);
    return !!this.data.groups[hash];
  }

  async markAsProcessed(imagePaths, outputPath) {
    if (!this.data) await this.load();
    const hash = this.generateGroupHash(imagePaths);
    this.data.groups[hash] = {
      timestamp: new Date().toISOString(),
      images: imagePaths,
      output: outputPath
    };
    await this.save();
  }
}

module.exports = { ProcessedFilesLog };
