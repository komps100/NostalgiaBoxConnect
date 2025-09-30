const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const osc = require('osc');
const net = require('net');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// OSC and TCP server instances
let oscTCPPort = null;
let tcpServer = null;
let isSequenceRunning = false;
let eosPingInterval = null;

// Eos state tracking
let eosData = {
  showName: '',
  cueList: '',        // Cue list number
  cueListName: '',    // Cue list name (text)
  cueLabel: '',       // Cue label (text only)
  cueNumber: '',      // Cue number
  connected: false
};

let settings = {
  outputPath: process.cwd(),
  namingConvention: '{eosCueListName}_{timestamp}_{input}_{eosCueLabel}_{eosCueNumber}',
  folderNaming: '{eosCueListName}_{timestamp}_{eosCueLabel}_{eosCueNumber}',
  routerIP: '10.101.130.101',
  eosIP: '',
  tcpPort: 9999,
  selectedDevice: null,
  detectedFramerate: 30
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings = { ...settings, ...savedSettings };

      // Force defaults if naming conventions are empty
      if (!settings.namingConvention || settings.namingConvention.trim() === '') {
        settings.namingConvention = '{eosCueListName}_{timestamp}_{input}_{eosCueLabel}_{eosCueNumber}';
      }
      if (!settings.folderNaming || settings.folderNaming.trim() === '') {
        settings.folderNaming = '{eosCueListName}_{timestamp}_{eosCueLabel}_{eosCueNumber}';
      }

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

ipcMain.handle('update-eos-ip', async (event, ip) => {
  settings.eosIP = ip;
  saveSettings();
  return true;
});

ipcMain.handle('update-tcp-port', async (event, port) => {
  settings.tcpPort = port;
  saveSettings();
  return true;
});

ipcMain.handle('update-folder-naming', async (event, convention) => {
  settings.folderNaming = convention;
  saveSettings();
  return true;
});

ipcMain.handle('connect-eos', async () => {
  return await connectToEos();
});

ipcMain.handle('disconnect-eos', async () => {
  return await disconnectFromEos();
});

ipcMain.handle('ping-eos', async () => {
  return await pingEos();
});

ipcMain.handle('start-tcp-server', async () => {
  return await startTCPServer();
});

ipcMain.handle('stop-tcp-server', async () => {
  return await stopTCPServer();
});

ipcMain.handle('get-eos-data', async () => {
  return eosData;
});

// ============== EOS OSC INTEGRATION ==============

function connectToEos() {
  return new Promise((resolve) => {
    if (oscTCPPort) {
      console.log('Already connected to Eos');
      return resolve({ success: false, error: 'Already connected' });
    }

    if (!settings.eosIP) {
      return resolve({ success: false, error: 'No Eos IP configured' });
    }

    try {
      console.log('=== EOS CONNECTION ATTEMPT ===');
      console.log(`Target IP: ${settings.eosIP}`);
      console.log(`TCP Port: 3032 (packet-length framing)`);

      // Create raw TCP connection (we'll handle OSC framing manually)
      const socket = new net.Socket();

      let receiveBuffer = Buffer.alloc(0);

      // Connect to Eos
      socket.connect(3032, settings.eosIP, () => {
        console.log('=== EOS CONNECTION ESTABLISHED ===');
        eosData.connected = true;

        // Subscribe to Eos updates
        console.log('Sending /eos/subscribe=1');
        sendOscMessage(socket, '/eos/subscribe', [{ type: 'i', value: 1 }]);

        // Send initial ping
        console.log('Sending /eos/ping');
        sendOscMessage(socket, '/eos/ping', []);

        // Request show name
        console.log('Requesting /eos/get/show/name');
        sendOscMessage(socket, '/eos/get/show/name', []);

        // Start periodic ping (every 5 seconds)
        eosPingInterval = setInterval(() => {
          if (socket && eosData.connected) {
            console.log('Sending keepalive ping to Eos');
            sendOscMessage(socket, '/eos/ping', []);
          }
        }, 5000);

        sendEosStatusUpdate();
        resolve({ success: true });
      });

      socket.on('data', (data) => {
        console.log(`Raw TCP data received: ${data.length} bytes`);

        // Append to buffer
        receiveBuffer = Buffer.concat([receiveBuffer, data]);

        // Process complete OSC messages (packet-length framing)
        while (receiveBuffer.length >= 4) {
          // Read message length (4-byte big-endian integer)
          const messageLength = receiveBuffer.readUInt32BE(0);

          // Check if we have the complete message
          if (receiveBuffer.length >= 4 + messageLength) {
            // Extract the OSC message
            const oscData = receiveBuffer.slice(4, 4 + messageLength);

            // Decode OSC message
            try {
              const oscMsg = osc.readPacket(oscData, { metadata: true });
              console.log('OSC message decoded:', oscMsg.address);
              handleEosMessage(oscMsg);
            } catch (err) {
              console.error('Failed to decode OSC message:', err);
            }

            // Remove processed message from buffer
            receiveBuffer = receiveBuffer.slice(4 + messageLength);
          } else {
            // Not enough data yet, wait for more
            break;
          }
        }
      });

      socket.on('error', (err) => {
        console.error('OSC TCP error:', err);
        eosData.connected = false;
        sendEosStatusUpdate();
        if (!eosData.connected) {
          resolve({ success: false, error: err.message });
        }
      });

      socket.on('close', () => {
        console.log('OSC TCP connection closed');
        eosData.connected = false;
        oscTCPPort = null;
        sendEosStatusUpdate();
      });

      // Store socket reference
      oscTCPPort = socket;

    } catch (error) {
      console.error('=== EOS CONNECTION FAILED ===');
      console.error('Error:', error);
      eosData.connected = false;
      oscTCPPort = null;
      resolve({ success: false, error: error.message });
    }
  });
}

// Helper function to send OSC messages with packet-length framing
function sendOscMessage(socket, address, args) {
  try {
    // Build OSC packet
    const packet = osc.writePacket({ address, args }, { metadata: true });

    // Create packet-length header (4-byte big-endian)
    const header = Buffer.alloc(4);
    header.writeUInt32BE(packet.length, 0);

    // Send header + packet
    socket.write(Buffer.concat([header, packet]));
  } catch (err) {
    console.error('Failed to send OSC message:', err);
  }
}

function disconnectFromEos() {
  return new Promise((resolve) => {
    if (!oscTCPPort) {
      return resolve({ success: true });
    }

    try {
      console.log('=== EOS DISCONNECTION ===');

      // Stop ping interval
      if (eosPingInterval) {
        clearInterval(eosPingInterval);
        eosPingInterval = null;
        console.log('Stopped ping interval');
      }

      // Unsubscribe from Eos
      console.log('Sending /eos/subscribe=0');
      sendOscMessage(oscTCPPort, '/eos/subscribe', [{ type: 'i', value: 0 }]);

      // Close TCP connection
      oscTCPPort.end();
      oscTCPPort = null;

      eosData.connected = false;
      eosData.showName = '';
      eosData.cueList = '';
      eosData.cueListName = '';
      eosData.cueLabel = '';
      eosData.cueNumber = '';

      sendEosStatusUpdate();
      console.log('=== EOS DISCONNECTED ===');
      resolve({ success: true });
    } catch (error) {
      console.error('=== EOS DISCONNECTION ERROR ===');
      console.error('Error:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

function pingEos() {
  return new Promise((resolve) => {
    if (!oscTCPPort) {
      return resolve({ success: false, error: 'Not connected to Eos' });
    }

    try {
      console.log('=== MANUAL EOS PING ===');
      console.log('Sending /eos/ping');
      sendOscMessage(oscTCPPort, '/eos/ping', []);

      // Also request current data
      console.log('Requesting /eos/get/show/name');
      sendOscMessage(oscTCPPort, '/eos/get/show/name', []);

      console.log('Ping sent successfully');
      resolve({ success: true });
    } catch (error) {
      console.error('Failed to ping Eos:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

function handleEosMessage(oscMsg) {
  console.log('=== EOS OSC MESSAGE RECEIVED ===');
  console.log('Address:', oscMsg.address);
  console.log('Args:', oscMsg.args);

  let dataUpdated = false;
  const address = oscMsg.address;
  const args = oscMsg.args || [];

  // Extract values from args (they come as {type, value} objects)
  const argValues = args.map(arg => arg.value !== undefined ? arg.value : arg);

  // Handle different Eos message types
  if (address === '/eos/out/active/cue/text') {
    // Active cue text format: "1/1 Hello 3.0 100%"
    // Extract just the label part (between the cue numbers and percentage)
    const fullText = argValues[0] || '';
    console.log('→ Active Cue Full Text:', fullText);

    // Parse format: "{list}/{number} {label} {progress}%"
    const match = fullText.match(/^[\d.]+\/[\d.]+\s+(.+?)\s+\d+%?$/);
    if (match) {
      eosData.cueLabel = match[1].trim();
      console.log('→ Extracted Cue Label:', eosData.cueLabel);
    } else {
      // Fallback: just use the full text
      eosData.cueLabel = fullText;
    }
    dataUpdated = true;
  }
  else if (address.match(/\/eos\/out\/active\/cue\/\d+\/\d+/)) {
    // Active cue list/number: /eos/out/active/cue/{list}/{cue}
    const parts = address.split('/');
    const cueList = parts[5] || '';
    const cueNumber = parts[6] || '';

    eosData.cueList = cueList;
    eosData.cueNumber = cueNumber;
    console.log(`→ Active Cue: List ${cueList}, Number ${cueNumber}`);

    // Request clean cue list name and cue label using OSC Get
    if (oscTCPPort && cueList) {
      console.log(`Requesting cue list name for list ${cueList}`);
      sendOscMessage(oscTCPPort, `/eos/get/cuelist/${cueList}`, []);

      if (cueNumber) {
        console.log(`Requesting cue label for ${cueList}/${cueNumber}`);
        sendOscMessage(oscTCPPort, `/eos/get/cue/${cueList}/${cueNumber}`, []);
      }
    }

    dataUpdated = true;
  }
  else if (address === '/eos/out/show/name') {
    console.log('→ Show Name:', argValues[0]);
    eosData.showName = argValues[0] || '';
    dataUpdated = true;
  }
  else if (address.match(/\/eos\/out\/get\/cuelist\/\d+/)) {
    // Response from /eos/get/cuelist/{number}
    // Format: /eos/out/get/cuelist/{number}
    // Args: [index, number, uid, label, ...]
    if (argValues.length >= 4) {
      const cueListLabel = argValues[3];
      console.log('→ Cue List Name:', cueListLabel);
      eosData.cueListName = cueListLabel || '';
      dataUpdated = true;
    }
  }
  else if (address.match(/\/eos\/out\/get\/cue\/\d+\//)) {
    // Response from /eos/get/cue/{list}/{number}
    // Format: /eos/out/get/cue/{list}/{number}
    // Args: [index, list, number, uid, label, ...]
    if (argValues.length >= 5) {
      const cueLabel = argValues[4];
      console.log('→ Clean Cue Label from Get:', cueLabel);
      eosData.cueLabel = cueLabel || '';
      dataUpdated = true;
    }
  }
  else if (address === '/eos/out/ping') {
    console.log('→ Ping response received');
    // Ping response - no action needed
  }
  else {
    console.log('→ Unhandled message type');
  }

  if (dataUpdated) {
    console.log('Current Eos Data:', JSON.stringify(eosData, null, 2));
    sendEosStatusUpdate();
  }
}

function sendEosStatusUpdate() {
  if (mainWindow) {
    mainWindow.webContents.send('eos-status-update', eosData);
  }
}

// ============== TCP SERVER FOR STREAM DECK ==============

function startTCPServer() {
  return new Promise((resolve) => {
    if (tcpServer) {
      return resolve({ success: false, error: 'Server already running' });
    }

    try {
      tcpServer = net.createServer((socket) => {
        console.log('Stream Deck client connected');

        socket.on('data', async (data) => {
          const command = data.toString().trim();
          console.log('Received command:', command);

          // Parse sequence command (e.g., "1,2,6")
          await handleSequenceCommand(command, socket);
        });

        socket.on('error', (err) => {
          console.error('Socket error:', err);
        });

        socket.on('close', () => {
          console.log('Stream Deck client disconnected');
        });
      });

      tcpServer.listen(settings.tcpPort, '0.0.0.0', () => {
        console.log(`TCP server listening on port ${settings.tcpPort}`);
        if (mainWindow) {
          mainWindow.webContents.send('tcp-server-status', { running: true, port: settings.tcpPort });
        }
        resolve({ success: true, port: settings.tcpPort });
      });

      tcpServer.on('error', (err) => {
        console.error('TCP server error:', err);
        tcpServer = null;
        if (mainWindow) {
          mainWindow.webContents.send('tcp-server-status', { running: false, error: err.message });
        }
        resolve({ success: false, error: err.message });
      });

    } catch (error) {
      console.error('Failed to start TCP server:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

function stopTCPServer() {
  return new Promise((resolve) => {
    if (!tcpServer) {
      return resolve({ success: true });
    }

    try {
      tcpServer.close(() => {
        console.log('TCP server stopped');
        tcpServer = null;
        if (mainWindow) {
          mainWindow.webContents.send('tcp-server-status', { running: false });
        }
        resolve({ success: true });
      });
    } catch (error) {
      console.error('Error stopping TCP server:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

// ============== SEQUENCE AUTOMATION ==============

async function handleSequenceCommand(command, socket) {
  if (isSequenceRunning) {
    socket.write('ERROR: Sequence already running\n');
    return;
  }

  try {
    // Parse input sequence (e.g., "1,2,6")
    const inputs = command.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 6);

    if (inputs.length === 0) {
      socket.write('ERROR: Invalid sequence format. Use: 1,2,6\n');
      return;
    }

    isSequenceRunning = true;
    socket.write(`Starting sequence: ${inputs.join(',')}\n`);

    for (const input of inputs) {
      try {
        socket.write(`Switching to input ${input}...\n`);

        // Switch router to input
        await setVideohubInput(input, 1);

        // Wait for router to settle
        await sleep(500);

        socket.write(`Capturing input ${input}...\n`);

        // Capture image
        const result = await captureStill(input);

        if (result.success) {
          socket.write(`✓ Captured input ${input} to ${result.filepath}\n`);
        } else {
          socket.write(`✗ Failed to capture input ${input}: ${result.error}\n`);
        }

        // Wait before next capture
        await sleep(500);

      } catch (error) {
        socket.write(`✗ Error on input ${input}: ${error.message}\n`);
      }
    }

    socket.write(`Sequence complete!\n`);
    isSequenceRunning = false;

  } catch (error) {
    console.error('Sequence error:', error);
    socket.write(`ERROR: ${error.message}\n`);
    isSequenceRunning = false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    console.log(`Eos data:`, JSON.stringify(eosData, null, 2));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Generate folder name with variable substitution and sanitize
    const folderNameRaw = replaceCaptureVariables(settings.folderNaming, inputNumber, timestamp);
    const folderName = sanitizeFilename(folderNameRaw);
    const captureFolder = path.join(settings.outputPath, folderName);

    // Create folder if it doesn't exist
    if (!fs.existsSync(captureFolder)) {
      console.log(`Creating capture folder: ${captureFolder}`);
      fs.mkdirSync(captureFolder, { recursive: true });
    }

    // Generate filename with variable substitution and sanitize
    const filenameRaw = replaceCaptureVariables(settings.namingConvention, inputNumber, timestamp);
    const filename = sanitizeFilename(filenameRaw);
    const filepath = path.join(captureFolder, `${filename}.png`);

    console.log(`Generated folder: ${folderName}`);
    console.log(`Generated filename: ${filename}`);
    console.log(`Generated filepath: ${filepath}`);
    console.log(`Output directory exists: ${fs.existsSync(captureFolder)}`);

    // Try multiple capture methods in order of preference
    tryCaptureMethods(filepath, resolve);
  });
}

// Sanitize a string for use in filenames/folder names
function sanitizeFilename(str) {
  // Remove or replace characters that are invalid in filenames
  return str
    .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid chars with underscore
    .replace(/,/g, '_')              // Replace commas with underscore
    .replace(/\s+/g, '_')            // Replace whitespace with underscore
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '');          // Trim underscores from start/end
}

function replaceCaptureVariables(template, inputNumber, timestamp) {
  // Sanitize each value before replacing
  const sanitizedInput = sanitizeFilename(String(inputNumber));
  const sanitizedTimestamp = sanitizeFilename(timestamp);
  const sanitizedCueList = sanitizeFilename(eosData.cueList || 'unknown');
  const sanitizedCueListName = sanitizeFilename(eosData.cueListName || eosData.cueList || 'unknown');
  const sanitizedCueLabel = sanitizeFilename(eosData.cueLabel || 'unknown');
  const sanitizedCueNumber = sanitizeFilename(eosData.cueNumber || 'unknown');
  const sanitizedShowName = sanitizeFilename(eosData.showName || 'unknown');

  return template
    .replace('{input}', sanitizedInput)
    .replace('{timestamp}', sanitizedTimestamp)
    .replace('{eosCueList}', sanitizedCueList)           // Cue list number
    .replace('{eosCueListName}', sanitizedCueListName)   // Cue list name
    .replace('{eosCueLabel}', sanitizedCueLabel)
    .replace('{eosCueNumber}', sanitizedCueNumber)
    .replace('{eosShowName}', sanitizedShowName);
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

