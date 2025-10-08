const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const osc = require('osc');
const net = require('net');
const { ImageProcessor } = require('./imageProcessor');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Logger for image processor
const logger = {
  info: (msg) => console.log(`[ImageProcessor] ${msg}`),
  warn: (msg) => console.warn(`[ImageProcessor] ${msg}`),
  error: (msg) => console.error(`[ImageProcessor] ${msg}`)
};

// Initialize image processor
let imageProcessor = null;

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

// Track pending OSC Get requests to ensure sequential flow
let pendingCueRequest = null; // { cueList, cueNumber }

let settings = {
  outputPath: process.cwd(),
  stitchedOutputPath: '',
  namingConvention: '{date}_{eosCueListName}_{eosCueLabel}_{input}',
  folderNaming: '{date}_{eosCueListName}_{eosCueLabel}',
  routerIP: '10.101.130.101',
  eosIP: '',
  tcpPort: 9999,
  selectedDevice: null,
  detectedFramerate: 30,
  stitchLayoutMode: 'auto'  // 'auto' or 'line'
};

// EOS reconnection tracking
let eosReconnectInterval = null;
let eosReconnectStartTime = null;
const EOS_INITIAL_RECONNECT_INTERVAL = 10000; // 10 seconds
const EOS_LATER_RECONNECT_INTERVAL = 30000;    // 30 seconds
const EOS_INITIAL_PERIOD = 120000;              // 2 minutes

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings = { ...settings, ...savedSettings };

      // Force defaults if naming conventions are empty
      if (!settings.namingConvention || settings.namingConvention.trim() === '') {
        settings.namingConvention = '{date}_{eosCueListName}_{eosCueLabel}_{input}';
      }
      if (!settings.folderNaming || settings.folderNaming.trim() === '') {
        settings.folderNaming = '{date}_{eosCueListName}_{eosCueLabel}';
      }

      console.log('Settings loaded:', settings);

      // Initialize image processor with output folder
      imageProcessor = new ImageProcessor(
        logger,
        settings.stitchedOutputPath || settings.outputPath,
        settings.outputPath
      );
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
    properties: ['openDirectory', 'createDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    settings.outputPath = result.filePaths[0];
    saveSettings();
    return settings.outputPath;
  }
  return null;
});

ipcMain.handle('select-stitched-output-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    settings.stitchedOutputPath = result.filePaths[0];
    saveSettings();
    return result.filePaths[0];
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

ipcMain.handle('update-stitch-layout-mode', async (event, mode) => {
  settings.stitchLayoutMode = mode;
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

ipcMain.handle('run-test-sequence', async (event, inputs) => {
  // Use the same handler as TCP/network triggers for consistency
  return await runSequenceShared(inputs, (msg, type = 'info') => {
    if (mainWindow) {
      mainWindow.webContents.send('sequence-progress', { message: msg, type });
    }
  });
});


ipcMain.handle('stitch-folder', async (event, folderPath) => {
  return await stitchImages(folderPath);
});

ipcMain.handle('stitch-latest-folder', async () => {
  return await stitchLatestFolder();
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

        // Auto-start Stream Deck TCP server 5 seconds after EOS connection
        setTimeout(() => {
          if (eosData.connected && !tcpServer) {
            console.log('Auto-starting TCP server 5s after EOS connection...');
            startTCPServer();
          }
        }, 5000);

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

        // Stop TCP server when EOS disconnects
        if (tcpServer) {
          console.log('Stopping TCP server due to EOS disconnect');
          stopTCPServer();
        }

        // Start auto-reconnect
        startEosAutoReconnect();
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

      // Stop reconnect interval
      if (eosReconnectInterval) {
        clearInterval(eosReconnectInterval);
        eosReconnectInterval = null;
        console.log('Stopped reconnect interval');
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
      pendingCueRequest = null; // Clear any pending requests

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

    // Sequential OSC Get flow: first get cuelist, then get cue
    if (oscTCPPort && cueList) {
      // Store the pending cue request for when cuelist response arrives
      pendingCueRequest = { cueList, cueNumber };

      // Add delay before requesting cuelist to give console time to prepare data
      console.log(`→ Waiting 500ms before requesting cue list info...`);
      setTimeout(() => {
        if (oscTCPPort) {
          console.log(`→ Requesting cue list name for list ${cueList}`);
          sendOscMessage(oscTCPPort, `/eos/get/cuelist/${cueList}`, []);
        }
      }, 500);
      // Note: We'll send get/cue AFTER receiving the cuelist response
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
    // Args: [index, uid, label, role_user, ...]
    if (argValues.length >= 3) {
      const cueListLabel = argValues[2];
      console.log('→ Cue List Name:', cueListLabel);
      eosData.cueListName = cueListLabel || '';
      dataUpdated = true;

      // Now that we have the cuelist response, send the pending cue request
      // Add delay to give console time to prepare cue data
      if (pendingCueRequest && oscTCPPort) {
        const { cueList, cueNumber } = pendingCueRequest;
        if (cueNumber) {
          console.log(`→ Waiting 500ms before requesting cue label...`);
          setTimeout(() => {
            if (oscTCPPort) {
              console.log(`→ Now requesting cue label for ${cueList}/${cueNumber}`);
              sendOscMessage(oscTCPPort, `/eos/get/cue/${cueList}/${cueNumber}`, []);
            }
          }, 500);
        }
        pendingCueRequest = null; // Clear pending request
      }
    }
  }
  else if (address.match(/\/eos\/out\/get\/cue\/\d+\//)) {
    // Response from /eos/get/cue/{list}/{number}
    // Format: /eos/out/get/cue/{list}/{number}/0/list/0/{count}
    // Args: [index, uid, label, uptime, downtime, ...]
    if (argValues.length >= 3) {
      const cueLabel = argValues[2]; // Label is at index 2
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

function startEosAutoReconnect() {
  if (!settings.eosIP || settings.eosIP.trim() === '') {
    return; // No IP configured, don't attempt reconnect
  }

  if (eosReconnectInterval) {
    return; // Already reconnecting
  }

  // Track when reconnection started
  if (!eosReconnectStartTime) {
    eosReconnectStartTime = Date.now();
  }

  const attemptReconnect = () => {
    if (eosData.connected) {
      // Successfully reconnected, stop interval
      if (eosReconnectInterval) {
        clearInterval(eosReconnectInterval);
        eosReconnectInterval = null;
      }
      return;
    }

    console.log('Attempting EOS auto-reconnect...');
    connectToEos().then(result => {
      if (result.success) {
        console.log('EOS auto-reconnect successful');
        eosReconnectStartTime = null;

        // Auto-start TCP server 5 seconds after successful reconnect
        setTimeout(() => {
          if (eosData.connected && !tcpServer) {
            console.log('Auto-starting TCP server after EOS reconnect...');
            startTCPServer();
          }
        }, 5000);
      }
    });

    // Adjust interval after 2 minutes
    const elapsedTime = Date.now() - eosReconnectStartTime;
    if (elapsedTime > EOS_INITIAL_PERIOD) {
      // Switch to 30-second interval
      if (eosReconnectInterval) {
        clearInterval(eosReconnectInterval);
      }
      eosReconnectInterval = setInterval(attemptReconnect, EOS_LATER_RECONNECT_INTERVAL);
    }
  };

  // Start with 10-second interval
  eosReconnectInterval = setInterval(attemptReconnect, EOS_INITIAL_RECONNECT_INTERVAL);
  console.log('Started EOS auto-reconnect (10s interval for first 2min, then 30s)');
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

// Shared sequence logic used by both manual UI button and TCP/network triggers
async function runSequenceShared(inputs, writeLog) {
  if (isSequenceRunning) {
    writeLog('ERROR: Sequence already running', 'error');
    return { success: false, error: 'Sequence already running' };
  }

  // 10 second timeout wrapper
  const sequencePromise = executeSequence(inputs, writeLog);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      writeLog('ERROR: Sequence timeout (10 seconds exceeded)', 'error');
      isSequenceRunning = false;
      resolve({ success: false, error: 'Sequence timeout' });
    }, 10000);
  });

  return Promise.race([sequencePromise, timeoutPromise]);
}

async function executeSequence(inputs, writeLog) {
  try {
    isSequenceRunning = true;
    let captured = 0;
    let failed = 0;

    writeLog(`Starting sequence: ${inputs.join(',')}`, 'info');

    // Generate folder once for the entire sequence
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderNameRaw = replaceCaptureVariables(settings.folderNaming, inputs[0], timestamp);
    const folderName = sanitizeFilename(folderNameRaw);
    const baseCaptureFolder = path.join(settings.outputPath, folderName);

    // Get unique folder path (adds (2), (3), etc. if folder exists)
    const captureFolder = getUniqueFolderPath(baseCaptureFolder);

    // Create folder if it doesn't exist
    if (!fs.existsSync(captureFolder)) {
      console.log(`Creating capture folder for sequence: ${captureFolder}`);
      fs.mkdirSync(captureFolder, { recursive: true });
    }

    for (const input of inputs) {
      try {
        writeLog(`Switching to input ${input}...`, 'info');

        // Switch router to input
        await setVideohubInput(input, 1);

        // Wait for router to settle
        await sleep(500);

        writeLog(`Capturing input ${input}...`, 'info');

        // Capture image with shared folder
        const result = await captureStill(input, captureFolder, timestamp);

        if (result.success) {
          captured++;
          writeLog(`✓ Captured input ${input} to ${result.filepath}`, 'success');
        } else {
          failed++;
          writeLog(`✗ Failed to capture input ${input}: ${result.error}`, 'error');
        }

        // Wait before next capture
        await sleep(500);

      } catch (error) {
        failed++;
        writeLog(`✗ Error on input ${input}: ${error.message}`, 'error');
      }
    }

    // Auto-stitch if stitched output path is configured
    if (settings.stitchedOutputPath && fs.existsSync(captureFolder)) {
      writeLog(`Stitching captured images...`, 'info');
      const stitchResult = await stitchImages(captureFolder);
      if (stitchResult.success) {
        writeLog(`✓ Stitched ${stitchResult.imageCount} images to ${stitchResult.filepath}`, 'success');
      } else {
        writeLog(`⚠ Stitch failed: ${stitchResult.error}`, 'error');
      }
    }

    // Switch back to input 1
    writeLog(`Switching back to input 1...`, 'info');
    await setVideohubInput(1, 1);

    writeLog(`Sequence complete!`, 'success');
    isSequenceRunning = false;

    return {
      success: true,
      total: inputs.length,
      captured,
      failed,
      captureFolder
    };

  } catch (error) {
    console.error('Sequence error:', error);
    writeLog(`ERROR: ${error.message}`, 'error');
    isSequenceRunning = false;
    return { success: false, error: error.message };
  }
}

async function handleSequenceCommand(command, socket) {
  try {
    // Parse input sequence (e.g., "1,2,6")
    const inputs = command.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 6);

    if (inputs.length === 0) {
      socket.write('ERROR: Invalid sequence format. Use: 1,2,6\n');
      return;
    }

    // Use shared sequence logic with socket output
    await runSequenceShared(inputs, (msg) => socket.write(`${msg}\n`));

  } catch (error) {
    console.error('TCP sequence error:', error);
    socket.write(`ERROR: ${error.message}\n`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait for file to stabilize (size stops changing)
async function waitForFileStable(filepath, maxWaitMs = 2000) {
  const startTime = Date.now();
  let lastSize = -1;
  let stableCount = 0;
  const requiredStableChecks = 3; // File size must be stable for 3 checks

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.size === lastSize && stats.size > 0) {
          stableCount++;
          if (stableCount >= requiredStableChecks) {
            console.log(`File stable at ${stats.size} bytes`);
            return true;
          }
        } else {
          stableCount = 0;
          lastSize = stats.size;
        }
      }
    } catch (err) {
      // File might be locked, continue waiting
    }
    await sleep(100);
  }

  console.log(`File stability timeout after ${maxWaitMs}ms`);
  return false;
}

// Fast capture with real-time file polling (NOT USED - kept for reference)
async function captureWithFilePolling(inputNumber, captureFolder, timestamp) {
  console.log(`=== FAST CAPTURE START (Input ${inputNumber}) ===`);

  const ffmpegPath = await findWorkingFFmpeg();
  if (!ffmpegPath) {
    return { success: false, error: 'FFmpeg not found' };
  }

  if (!settings.selectedDevice) {
    return { success: false, error: 'No device selected' };
  }

  const device = settings.selectedDevice;
  const deviceIndex = device.index;

  // Generate expected filepath (FILE path, not folder)
  const filenameRaw = replaceCaptureVariables(settings.namingConvention, inputNumber, timestamp);
  const filename = sanitizeFilename(filenameRaw);
  const filepath = path.join(captureFolder, `${filename}.png`);

  console.log(`Target FILE: ${filepath}`);

  // Start FFmpeg capture process
  const detectedFps = settings.detectedFramerate || 30;
  const command = `${ffmpegPath} -f avfoundation -framerate ${detectedFps} -i "${deviceIndex}" -frames:v 1 -update 1 "${filepath}"`;

  console.log(`Starting capture: ${command}`);

  const captureProcess = exec(command, {
    timeout: 5000,
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
  });

  // Poll for FILE creation (check every 100ms for max 1 second)
  const startTime = Date.now();
  const maxWaitTime = 1000; // 1 second max
  const pollInterval = 100; // Check every 100ms

  console.log(`Polling for FILE creation at: ${filepath}`);

  while (Date.now() - startTime < maxWaitTime) {
    // Check if FILE exists (not folder)
    if (fs.existsSync(filepath)) {
      try {
        const stats = fs.statSync(filepath);
        console.log(`File exists! Size: ${stats.size} bytes`);
        if (stats.size > 0) {
          const elapsed = Date.now() - startTime;
          console.log(`✓ FILE created in ${elapsed}ms with size ${stats.size} bytes`);
          // Give FFmpeg a moment to finish writing
          await sleep(50);
          return { success: true, filepath };
        }
      } catch (err) {
        console.log(`Error reading file stats: ${err.message}`);
        // File might be locked, continue polling
      }
    }
    await sleep(pollInterval);
  }

  // Timeout - kill the process
  console.log(`✗ Timeout after ${maxWaitTime}ms - killing FFmpeg process`);
  console.log(`FILE was NOT created at: ${filepath}`);
  try {
    captureProcess.kill('SIGKILL');
  } catch (err) {
    console.log('Failed to kill process:', err.message);
  }

  return {
    success: false,
    error: 'No source detected (timeout)'
  };
}

async function captureWithRetry(inputNumber, maxRetries, timeoutMs, captureFolder = null, timestamp = null) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Capture attempt ${attempt}/${maxRetries} for input ${inputNumber}`);

      // Wrap captureStill with a timeout to prevent hanging
      const result = await Promise.race([
        captureStill(inputNumber, captureFolder, timestamp),
        new Promise((resolve) =>
          setTimeout(() => resolve({
            success: false,
            error: 'Capture timeout - no source detected'
          }), 1001) // 1001ms timeout per attempt
        )
      ]);

      if (result.success) {
        // Verify file exists and has size > 0
        if (fs.existsSync(result.filepath)) {
          const stats = fs.statSync(result.filepath);
          if (stats.size > 0) {
            console.log(`✓ Capture successful on attempt ${attempt}`);
            return result;
          }
        }
      }

      console.log(`Attempt ${attempt} failed: ${result.error || 'Unknown error'}`);
      if (attempt < maxRetries) {
        console.log(`Waiting ${timeoutMs}ms before retry...`);
        await sleep(timeoutMs);
      }

    } catch (error) {
      console.error(`Capture attempt ${attempt} error:`, error);
      if (attempt < maxRetries) {
        await sleep(timeoutMs);
      }
    }
  }

  return {
    success: false,
    error: `No source detected after ${maxRetries} attempts`
  };
}

function sendSequenceProgress(message, type = 'info') {
  if (mainWindow) {
    mainWindow.webContents.send('sequence-progress', { message, type });
  }
  console.log(`[SEQUENCE] ${message}`);
}

// ============== IMAGE STITCHING ==============

async function stitchLatestFolder() {
  try {
    console.log('=== FINDING LATEST FOLDER TO STITCH ===');

    if (!settings.outputPath) {
      return { success: false, error: 'No capture folder configured' };
    }

    // Read all subdirectories in the capture folder
    const items = fs.readdirSync(settings.outputPath, { withFileTypes: true });
    const folders = items
      .filter(item => item.isDirectory())
      .map(folder => ({
        name: folder.name,
        path: path.join(settings.outputPath, folder.name),
        stat: fs.statSync(path.join(settings.outputPath, folder.name))
      }))
      .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time, newest first

    if (folders.length === 0) {
      return { success: false, error: 'No folders found in capture directory' };
    }

    // Get the most recent folder
    const latestFolder = folders[0];
    console.log(`Latest folder: ${latestFolder.name} (${latestFolder.stat.mtime})`);

    // Check if it has PNG images
    const pngFiles = fs.readdirSync(latestFolder.path).filter(f => f.toLowerCase().endsWith('.png'));
    if (pngFiles.length === 0) {
      return { success: false, error: `Latest folder (${latestFolder.name}) has no PNG images` };
    }

    console.log(`Found ${pngFiles.length} PNG files in latest folder`);

    // Stitch the folder
    return await stitchImages(latestFolder.path);

  } catch (error) {
    console.error('Error finding latest folder:', error);
    return { success: false, error: error.message };
  }
}

async function stitchImages(folderPath) {
  try {
    console.log('=== STARTING IMAGE STITCH ===');
    console.log(`Folder: ${folderPath}`);

    if (!fs.existsSync(folderPath)) {
      return { success: false, error: 'Folder does not exist' };
    }

    // Read all PNG files from folder
    const files = fs.readdirSync(folderPath)
      .filter(file => file.toLowerCase().endsWith('.png'))
      .sort(); // Sort alphabetically

    if (files.length === 0) {
      return { success: false, error: 'No PNG images found in folder' };
    }

    if (files.length === 1) {
      console.log('Only 1 image found, skipping stitch');
      return { success: false, error: 'Need at least 2 images to stitch' };
    }

    if (files.length > 6) {
      console.log(`Found ${files.length} images - limiting to first 6`);
      files.splice(6); // Keep only first 6
    }

    console.log(`Found ${files.length} images to stitch`);

    // Ensure image processor is initialized
    if (!imageProcessor) {
      imageProcessor = new ImageProcessor(
        logger,
        settings.stitchedOutputPath || settings.outputPath,
        settings.outputPath
      );
    }

    // Update output folder in case settings changed
    imageProcessor.setOutputFolder(settings.stitchedOutputPath || settings.outputPath);

    // Build full paths
    const imagePaths = files.map(f => path.join(folderPath, f));

    // Use Sharp-based processor
    await imageProcessor.stitchImages(imagePaths);

    // Get the expected output path
    const folderName = path.basename(folderPath);
    const outputPath = settings.stitchedOutputPath || settings.outputPath;
    const outputFilePath = path.join(outputPath, `${folderName}.jpg`);

    if (fs.existsSync(outputFilePath)) {
      const stats = fs.statSync(outputFilePath);
      if (stats.size > 0) {
        console.log(`✓ Successfully stitched ${files.length} images to ${outputFilePath}`);
        return { success: true, filepath: outputFilePath, imageCount: files.length };
      }
    }

    return { success: false, error: 'Stitched file not created' };

  } catch (error) {
    console.error('Stitch error:', error);
    return { success: false, error: error.message };
  }
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

async function captureStill(inputNumber, providedCaptureFolder = null, providedTimestamp = null) {
  return new Promise((resolve, reject) => {
    console.log('=== CAPTURE START ===');
    console.log(`captureStill called with inputNumber: ${inputNumber}`);
    console.log(`Provided folder: ${providedCaptureFolder || 'none (will generate)'}`);
    console.log(`Provided timestamp: ${providedTimestamp || 'none (will generate)'}`);
    console.log(`Current settings:`, JSON.stringify(settings, null, 2));
    console.log(`Eos data:`, JSON.stringify(eosData, null, 2));

    const timestamp = providedTimestamp || new Date().toISOString().replace(/[:.]/g, '-');

    // Use provided folder or generate a new one
    let captureFolder;
    if (providedCaptureFolder) {
      captureFolder = providedCaptureFolder;
      console.log(`Using provided capture folder: ${captureFolder}`);
    } else {
      // Generate folder name with variable substitution and sanitize
      const folderNameRaw = replaceCaptureVariables(settings.folderNaming, inputNumber, timestamp);
      const folderName = sanitizeFilename(folderNameRaw);
      const baseCaptureFolder = path.join(settings.outputPath, folderName);

      // Get unique folder path (adds (2), (3), etc. if folder exists)
      captureFolder = getUniqueFolderPath(baseCaptureFolder);
      console.log(`Generated new capture folder: ${captureFolder}`);
    }

    // Create folder if it doesn't exist
    if (!fs.existsSync(captureFolder)) {
      console.log(`Creating capture folder: ${captureFolder}`);
      fs.mkdirSync(captureFolder, { recursive: true });
    }

    // Generate filename with variable substitution and sanitize
    const filenameRaw = replaceCaptureVariables(settings.namingConvention, inputNumber, timestamp);
    const filename = sanitizeFilename(filenameRaw);
    const filepath = path.join(captureFolder, `${filename}.png`);

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
    .replace(/,/g, '_');             // Replace commas with underscore
}

// Generate a unique folder path by adding (2), (3), etc. if folder exists
function getUniqueFolderPath(basePath) {
  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  let counter = 2;
  let uniquePath = basePath;

  while (fs.existsSync(uniquePath)) {
    uniquePath = `${basePath} (${counter})`;
    counter++;
  }

  return uniquePath;
}

// Generate a unique file path by adding _(2), _(3), etc. if file exists
function getUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);

  let counter = 2;
  let uniquePath = filePath;

  while (fs.existsSync(uniquePath)) {
    uniquePath = path.join(dir, `${basename}_(${counter})${ext}`);
    counter++;
  }

  return uniquePath;
}

function replaceCaptureVariables(template, inputNumber, timestamp) {
  // Sanitize each value before replacing
  const sanitizedInput = sanitizeFilename(String(inputNumber));
  const sanitizedTimestamp = sanitizeFilename(timestamp);

  // Generate date-only string in YYYYMMDD format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateOnly = `${year}${month}${day}`;

  const sanitizedCueList = sanitizeFilename(eosData.cueList || 'unknown');
  const sanitizedCueListName = sanitizeFilename(eosData.cueListName || eosData.cueList || 'unknown');
  const sanitizedCueLabel = sanitizeFilename(eosData.cueLabel || 'unknown');
  const sanitizedCueNumber = sanitizeFilename(eosData.cueNumber || 'unknown');
  const sanitizedShowName = sanitizeFilename(eosData.showName || 'unknown');

  return template
    .replace('{input}', sanitizedInput)
    .replace('{timestamp}', sanitizedTimestamp)
    .replace('{date}', dateOnly)                         // Date only YYYYMMDD
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

