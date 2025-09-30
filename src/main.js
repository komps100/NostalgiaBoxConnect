const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const osc = require('node-osc');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

let settings = {
  outputPath: process.cwd(),
  namingConvention: 'capture_{input}_{timestamp}',
  routerIP: '10.101.130.101',
  selectedDevice: null,
  detectedFramerate: 30
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings = { ...settings, ...savedSettings };
      console.log('Settings loaded:', settings);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
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

ipcMain.handle('select-output-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    settings.outputPath = result.filePaths[0];
    saveSettings();
    return settings.outputPath;
  }
  return null;
});

ipcMain.handle('update-naming-convention', async (event, convention) => {
  settings.namingConvention = convention;
  saveSettings();
  return true;
});

ipcMain.handle('update-router-ip', async (event, ip) => {
  settings.routerIP = ip;
  saveSettings();
  return true;
});

ipcMain.handle('switch-input', async (event, input, output = 1) => {
  return await setVideohubInput(input, output);
});

ipcMain.handle('get-settings', async () => {
  return settings;
});

ipcMain.handle('capture-still', async () => {
  return await captureStill('current');
});

ipcMain.handle('detect-devices', async () => {
  return await detectVideoDevices();
});

ipcMain.handle('select-device', async (event, device) => {
  settings.selectedDevice = device;
  saveSettings();
  return true;
});

ipcMain.handle('set-framerate', async (event, framerate) => {
  settings.detectedFramerate = framerate;
  saveSettings();
  console.log(`Framerate detected and saved: ${framerate}fps`);
  return true;
});



function getFFmpegPaths() {
  return [
    'ffmpeg',                           // System PATH
    '/usr/local/bin/ffmpeg',           // Intel Homebrew
    '/opt/homebrew/bin/ffmpeg',        // ARM Homebrew
    '/usr/bin/ffmpeg'                  // System install
  ];
}

async function findWorkingFFmpeg() {
  return new Promise((resolve) => {
    const ffmpegPaths = getFFmpegPaths();

    function tryPath(pathIndex = 0) {
      if (pathIndex >= ffmpegPaths.length) {
        resolve(null);
        return;
      }

      const ffmpegPath = ffmpegPaths[pathIndex];
      exec(`${ffmpegPath} -version`, {
        env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
      }, (error) => {
        if (!error) {
          resolve(ffmpegPath);
        } else {
          tryPath(pathIndex + 1);
        }
      });
    }

    tryPath();
  });
}

async function detectVideoDevices() {
  return new Promise((resolve) => {
    console.log('Detecting video devices...');

    // Try multiple FFmpeg paths
    const ffmpegPaths = getFFmpegPaths();

    function tryNextPath(pathIndex = 0) {
      if (pathIndex >= ffmpegPaths.length) {
        console.log('FFmpeg not found in any location');
        resolve([{
          index: -1,
          name: 'FFmpeg not installed - Run: brew install ffmpeg',
          isBlackmagic: false,
          error: true
        }]);
        return;
      }

      const ffmpegPath = ffmpegPaths[pathIndex];
      console.log(`Trying FFmpeg path: ${ffmpegPath}`);

      exec(`${ffmpegPath} -f avfoundation -list_devices true -i ""`, {
        timeout: 10000,
        env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
      }, (listError, listStdout, listStderr) => {
        console.log('Device detection results:');
        console.log('Error:', listError);
        console.log('Stdout:', listStdout);
        console.log('Stderr:', listStderr);

        if (listError && listError.code !== 1 && listError.code !== 251) {
          console.log(`FFmpeg path ${ffmpegPath} failed, trying next...`);
          tryNextPath(pathIndex + 1);
          return;
        }

        console.log(`FFmpeg found and working at: ${ffmpegPath}`);
        const deviceList = listStderr || '';
        console.log('Raw device list:', deviceList);

        const devices = [];

        // Look for video devices section
        if (deviceList.includes('AVFoundation video devices:')) {
          // Extract lines after video devices header
          const lines = deviceList.split('\n');
          let inVideoSection = false;

          for (const line of lines) {
            if (line.includes('AVFoundation video devices:')) {
              inVideoSection = true;
              continue;
            }

            if (line.includes('AVFoundation audio devices:')) {
              inVideoSection = false;
              break;
            }

            if (inVideoSection) {
              // Match device pattern [AVFoundation indev @ 0x...] [index] name
              const deviceMatch = line.match(/\[AVFoundation indev.*?\]\s+\[(\d+)\]\s+(.+)$/);
              if (deviceMatch) {
                const [, index, name] = deviceMatch;
                const deviceName = name.trim();
                devices.push({
                  index: parseInt(index),
                  name: deviceName,
                  isBlackmagic: deviceName.toLowerCase().includes('blackmagic')
                });
              }
            }
          }
        }

        if (devices.length === 0) {
          devices.push({
            index: -1,
            name: 'No video devices detected - Connect UltraStudio and check drivers',
            isBlackmagic: false,
            error: true
          });
        }

        console.log('Final detected devices:', devices);
        resolve(devices);
      });
    }

    tryNextPath();
  });
}

function validateIP(ip) {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^localhost$|^127\.0\.0\.1$|^10\.101\.130\.101$/;
  return ipRegex.test(ip);
}

async function setVideohubInput(input, output = 1) {
  return new Promise((resolve, reject) => {
    console.log(`setVideohubInput called: input=${input}, output=${output}`);

    if (!validateIP(settings.routerIP)) {
      console.error(`Invalid IP: ${settings.routerIP}`);
      reject(new Error('Invalid IP address'));
      return;
    }

    if (input < 1 || input > 6 || output < 1 || output > 2) {
      console.error(`Invalid range: input=${input}, output=${output}`);
      reject(new Error('Invalid input/output range'));
      return;
    }

    const adjustedInput = input - 1;
    const adjustedOutput = output - 1;
    const routingCommand = `VIDEO OUTPUT ROUTING:\r\n${adjustedOutput} ${adjustedInput}\r\n\r\n`;

    const command = `printf "${routingCommand}" | nc ${settings.routerIP} 9990`;
    console.log(`Executing command: ${command}`);
    console.log(`Routing command: ${JSON.stringify(routingCommand)}`);

    exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Videohub error: ${error}`);
        console.error(`Stderr: ${stderr}`);
        reject(error);
      } else {
        console.log(`Set output ${output} to input ${input} (sent ${adjustedOutput} ${adjustedInput})`);
        console.log(`Stdout: ${stdout}`);
        resolve();
      }
    });
  });
}

async function captureStill(inputNumber) {
  return new Promise((resolve, reject) => {
    console.log('=== CAPTURE START ===');
    console.log(`captureStill called with inputNumber: ${inputNumber}`);
    console.log(`Current settings:`, JSON.stringify(settings, null, 2));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = settings.namingConvention
      .replace('{input}', inputNumber)
      .replace('{timestamp}', timestamp);
    const filepath = path.join(settings.outputPath, `${filename}.png`);

    console.log(`Generated filename: ${filename}`);
    console.log(`Generated filepath: ${filepath}`);
    console.log(`Output directory exists: ${fs.existsSync(settings.outputPath)}`);
    console.log(`Output directory writable: ${fs.accessSync(settings.outputPath, fs.constants.W_OK) === undefined}`);

    // Try multiple capture methods in order of preference
    tryCaptureMethods(filepath, resolve);
  });
}

function tryCaptureMethods(filepath, resolve) {
  console.log('Trying capture methods...');

  // Method 0: Try selected device first (if one is selected)
  if (settings.selectedDevice) {
    console.log('Using selected device:', settings.selectedDevice);
    trySelectedDeviceCapture(filepath, (success) => {
      if (success) {
        resolve({ success: true, filepath, method: 'selected_device' });
        return;
      }

      console.log('Selected device failed, trying fallback methods...');
      tryFallbackMethods(filepath, resolve);
    });
  } else {
    console.log('No device selected, trying automatic detection...');
    tryFallbackMethods(filepath, resolve);
  }
}

function tryFallbackMethods(filepath, resolve) {
  // Method 1: Try device index approach (most reliable)
  tryDeviceIndexCapture(filepath, (success) => {
    if (success) {
      resolve({ success: true, filepath, method: 'device_index' });
      return;
    }

    // Method 2: Try device name approach
    tryDeviceNameCapture(filepath, (success) => {
      if (success) {
        resolve({ success: true, filepath, method: 'device_name' });
        return;
      }

      // Method 3: Try first available video device
      tryFirstDeviceCapture(filepath, (success) => {
        if (success) {
          resolve({ success: true, filepath, method: 'first_device' });
          return;
        }

        // All methods failed
        console.error('=== ALL CAPTURE METHODS FAILED ===');
        resolve({ success: false, error: 'All capture methods failed. Check console logs for details.' });
      });
    });
  });
}

async function trySelectedDeviceCapture(filepath, callback) {
  console.log('=== METHOD 0: Selected Device ===');

  const ffmpegPath = await findWorkingFFmpeg();
  if (!ffmpegPath) {
    console.log('FFmpeg not available');
    return callback(false);
  }

  const device = settings.selectedDevice;
  const deviceIndex = device.index;

  console.log(`Device: ${device.name} (index: ${deviceIndex})`);
  console.log(`FFmpeg path: ${ffmpegPath}`);
  console.log(`Output path: ${filepath}`);

  // Use detected framerate from preview, or fallback to common rates (20fps+)
  const detectedFps = settings.detectedFramerate || 30;
  const framerates = [detectedFps, 30, 29.97, 24, 23.98].filter((v, i, a) => a.indexOf(v) === i);
  let framerateIndex = 0;

  console.log(`Using detected framerate: ${detectedFps}fps, fallbacks: ${framerates.join(', ')}`);

  function tryNextFramerate() {
    if (framerateIndex >= framerates.length) {
      console.log('✗ All framerates failed');
      return callback(false);
    }

    const framerate = framerates[framerateIndex++];
    const command = `${ffmpegPath} -f avfoundation -framerate ${framerate} -i "${deviceIndex}" -frames:v 1 -update 1 "${filepath}"`;
    console.log(`Trying framerate ${framerate}fps: ${command}`);

    exec(command, {
      timeout: 30000,
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
    }, (error, stdout, stderr) => {
      console.log(`=== Framerate ${framerate}fps result ===`);
      if (error) {
        console.log('Error code:', error.code);
      }
      console.log('Stderr snippet:', stderr.substring(stderr.length - 500));
      console.log(`File exists: ${fs.existsSync(filepath)}`);

      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`File size: ${stats.size} bytes`);
        if (stats.size > 0) {
          console.log(`✓ Successfully captured at ${framerate}fps`);
          return callback(true);
        } else {
          fs.unlinkSync(filepath);
        }
      }

      // Try next framerate
      tryNextFramerate();
    });
  }

  tryNextFramerate();
}

async function tryDeviceIndexCapture(filepath, callback) {
  console.log('=== METHOD 1: Device Index Capture ===');
  const ffmpegPath = await findWorkingFFmpeg();
  if (!ffmpegPath) {
    console.log('FFmpeg not available, skipping to next method');
    return callback(false);
  }

  exec(`${ffmpegPath} -f avfoundation -list_devices true -i ""`, {
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
  }, (listError, listStdout, listStderr) => {
    if (listError && listError.code !== 1 && listError.code !== 251) {
      console.log('FFmpeg not available, skipping to next method');
      return callback(false);
    }

    const deviceList = listStderr || '';
    console.log('Available devices:', deviceList);

    // Look for ANY video device by index
    const videoDeviceMatches = deviceList.match(/\[(\d+)\] (.+)/g);
    if (videoDeviceMatches) {
      // Try the first video device found
      const firstMatch = videoDeviceMatches[0];
      const [, index, name] = firstMatch.match(/\[(\d+)\] (.+)/);
      console.log(`Found video device at index ${index}: ${name}`);

      const command = `${ffmpegPath} -f avfoundation -framerate 30 -i "${index}" -frames:v 1 -update 1 "${filepath}"`;
      console.log(`Capture command: ${command}`);

      exec(command, {
        timeout: 30000,
        env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
      }, (error, stdout, stderr) => {
        console.log('=== METHOD 1 RESULT ===');
        console.log('Error:', error);
        console.log('Error code:', error ? error.code : 'none');
        console.log('Stderr:', stderr);
        console.log(`File exists after capture: ${fs.existsSync(filepath)}`);

        if (fs.existsSync(filepath)) {
          const stats = fs.statSync(filepath);
          console.log(`File size: ${stats.size} bytes`);
          if (stats.size > 0) {
            console.log(`✓ Successfully captured using device index ${index}`);
            return callback(true);
          }
        }
        console.log('✗ Device index capture failed');
        callback(false);
      });
      return;
    }

    console.log('No video devices found by index');
    callback(false);
  });
}

async function tryDeviceNameCapture(filepath, callback) {
  console.log('Method 2: Trying device name capture...');

  const ffmpegPath = await findWorkingFFmpeg();
  if (!ffmpegPath) {
    console.log('FFmpeg not available, skipping to next method');
    return callback(false);
  }

  const deviceNames = [
    'UltraStudio Recorder 3G',
    'Blackmagic UltraStudio Recorder 3G',
    'UltraStudio HD Mini',
    'Blackmagic UltraStudio HD Mini',
    'UltraStudio'
  ];

  let tried = 0;

  function tryNextDevice() {
    if (tried >= deviceNames.length) {
      console.log('All device names failed');
      return callback(false);
    }

    const deviceName = deviceNames[tried++];
    console.log(`Trying device name: ${deviceName}`);

    const command = `${ffmpegPath} -f avfoundation -i "${deviceName}" -frames:v 1 -y "${filepath}"`;
    exec(command, {
      timeout: 10000,
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
    }, (error, stdout, stderr) => {
      if (!error && fs.existsSync(filepath)) {
        console.log(`Successfully captured using device name: ${deviceName}`);
        return callback(true);
      }

      console.log(`Device name "${deviceName}" failed, trying next...`);
      setTimeout(tryNextDevice, 100); // Small delay between attempts
    });
  }

  tryNextDevice();
}

async function tryFirstDeviceCapture(filepath, callback) {
  console.log('=== METHOD 3: First Device Capture ===');

  const ffmpegPath = await findWorkingFFmpeg();
  if (!ffmpegPath) {
    console.log('FFmpeg not available, skipping to next method');
    return callback(false);
  }

  exec(`${ffmpegPath} -f avfoundation -list_devices true -i ""`, {
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
  }, (listError, listStdout, listStderr) => {
    if (listError && listError.code !== 1 && listError.code !== 251) {
      return callback(false);
    }

    const deviceList = listStderr || '';
    const firstVideoMatch = deviceList.match(/\[0\] (.+)/);

    if (firstVideoMatch) {
      const command = `${ffmpegPath} -f avfoundation -framerate 30 -i "0" -frames:v 1 -update 1 "${filepath}"`;
      console.log(`Trying first device (index 0): ${command}`);

      exec(command, {
        timeout: 30000,
        env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
      }, (error, stdout, stderr) => {
        console.log('=== METHOD 3 RESULT ===');
        console.log('Error:', error);
        console.log('Error code:', error ? error.code : 'none');
        console.log('Stderr:', stderr);
        console.log(`File exists after capture: ${fs.existsSync(filepath)}`);

        if (fs.existsSync(filepath)) {
          const stats = fs.statSync(filepath);
          console.log(`File size: ${stats.size} bytes`);
          if (stats.size > 0) {
            console.log('✓ Successfully captured using first available device');
            return callback(true);
          }
        }

        console.log('✗ First device capture failed');
        callback(false);
      });
    } else {
      console.log('No video devices found');
      callback(false);
    }
  });
}

