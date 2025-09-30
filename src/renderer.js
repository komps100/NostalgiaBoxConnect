let currentSettings = {
    outputPath: '',
    namingConvention: '{date}_{eosCueListName}_{eosCueLabel}_{input}',
    folderNaming: '{date}_{eosCueListName}_{eosCueLabel}',
    routerIP: '10.101.130.101',
    eosIP: '',
    tcpPort: 9999
};

let currentEosData = {
    showName: '',
    cueList: '',
    cueListName: '',
    cueLabel: '',
    cueNumber: '',
    connected: false
};

const elements = {
    currentPath: null,
    namingConvention: null,
    folderNaming: null,
    routerIP: null,
    eosIP: null,
    tcpPort: null,
    connectEos: null,
    disconnectEos: null,
    pingEos: null,
    eosStatus: null,
    eosDataDisplay: null,
    eosShowValue: null,
    eosCueListValue: null,
    eosCueNumberValue: null,
    eosCueLabelValue: null,
    folderPreview: null,
    filePreview: null,
    startServer: null,
    stopServer: null,
    serverStatus: null,
    captureDevice: null,
    refreshDevices: null,
    previewContainer: null,
    previewVideo: null,
    previewStatus: null,
    status: null
};

let previewStream = null;
let isPreviewActive = false;
let detectedFramerate = 30; // Default fallback

// Helper functions for naming preview
function sanitizeFilename(str) {
    return str
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/,/g, '_');
}

function generatePreview(template, inputNumber, timestamp) {
    const sanitizedInput = sanitizeFilename(String(inputNumber));
    const sanitizedTimestamp = sanitizeFilename(timestamp);

    // Generate date-only string in YYYYMMDD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateOnly = `${year}${month}${day}`;

    const sanitizedCueList = sanitizeFilename(currentEosData.cueList || 'unknown');
    const sanitizedCueListName = sanitizeFilename(currentEosData.cueListName || currentEosData.cueList || 'unknown');
    const sanitizedCueLabel = sanitizeFilename(currentEosData.cueLabel || 'unknown');
    const sanitizedCueNumber = sanitizeFilename(currentEosData.cueNumber || 'unknown');
    const sanitizedShowName = sanitizeFilename(currentEosData.showName || 'unknown');

    let result = template
        .replace('{input}', sanitizedInput)
        .replace('{timestamp}', sanitizedTimestamp)
        .replace('{date}', dateOnly)
        .replace('{eosCueList}', sanitizedCueList)
        .replace('{eosCueListName}', sanitizedCueListName)
        .replace('{eosCueLabel}', sanitizedCueLabel)
        .replace('{eosCueNumber}', sanitizedCueNumber)
        .replace('{eosShowName}', sanitizedShowName);

    return sanitizeFilename(result);
}

function updateNamingPreviews() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderTemplate = elements.folderNaming.value || '{date}_{eosCueListName}_{eosCueLabel}';
    const fileTemplate = elements.namingConvention.value || '{date}_{eosCueListName}_{eosCueLabel}_{input}';

    const folderPreview = generatePreview(folderTemplate, 'current', timestamp);
    const filePreview = generatePreview(fileTemplate, 'current', timestamp) + '.png';

    elements.folderPreview.textContent = folderPreview || '(empty)';
    elements.filePreview.textContent = filePreview || '(empty)';
}

function initElements() {
    elements.currentPath = document.getElementById('currentPath');
    elements.namingConvention = document.getElementById('namingConvention');
    elements.folderNaming = document.getElementById('folderNaming');
    elements.routerIP = document.getElementById('routerIP');
    elements.eosIP = document.getElementById('eosIP');
    elements.tcpPort = document.getElementById('tcpPort');
    elements.connectEos = document.getElementById('connectEos');
    elements.disconnectEos = document.getElementById('disconnectEos');
    elements.pingEos = document.getElementById('pingEos');
    elements.eosStatus = document.getElementById('eosStatus');
    elements.eosDataDisplay = document.getElementById('eosDataDisplay');
    elements.eosShowValue = document.getElementById('eosShowValue');
    elements.eosCueListValue = document.getElementById('eosCueListValue');
    elements.eosCueNumberValue = document.getElementById('eosCueNumberValue');
    elements.eosCueLabelValue = document.getElementById('eosCueLabelValue');
    elements.folderPreview = document.getElementById('folderPreview');
    elements.filePreview = document.getElementById('filePreview');
    elements.startServer = document.getElementById('startServer');
    elements.stopServer = document.getElementById('stopServer');
    elements.serverStatus = document.getElementById('serverStatus');
    elements.captureDevice = document.getElementById('captureDevice');
    elements.refreshDevices = document.getElementById('refreshDevices');
    elements.previewContainer = document.getElementById('previewContainer');
    elements.previewVideo = document.getElementById('previewVideo');
    elements.previewStatus = document.getElementById('previewStatus');
    elements.status = document.getElementById('status');
}

async function loadSettings() {
    try {
        currentSettings = await window.electronAPI.getSettings();
        elements.currentPath.textContent = currentSettings.outputPath || 'No folder selected';
        elements.namingConvention.value = currentSettings.namingConvention;
        elements.folderNaming.value = currentSettings.folderNaming;
        elements.routerIP.value = currentSettings.routerIP;
        elements.eosIP.value = currentSettings.eosIP || '';
        elements.tcpPort.value = currentSettings.tcpPort || 9999;

        // Initialize naming preview
        updateNamingPreviews();
    } catch (error) {
        showStatus('Failed to load settings', 'error');
    }
}

async function selectOutputPath() {
    try {
        const path = await window.electronAPI.selectOutputPath();
        if (path) {
            currentSettings.outputPath = path;
            elements.currentPath.textContent = path;
            showStatus('Output path updated', 'success');
        }
    } catch (error) {
        showStatus('Failed to select path', 'error');
    }
}

async function updateNamingConvention() {
    const convention = elements.namingConvention.value;
    try {
        await window.electronAPI.updateNamingConvention(convention);
        currentSettings.namingConvention = convention;
        showStatus('Naming convention updated', 'success');
    } catch (error) {
        showStatus('Failed to update naming convention', 'error');
    }
}

async function captureNow() {
    console.log('=== RENDERER: Capture button clicked ===');
    console.log('Current settings:', JSON.stringify(currentSettings, null, 2));

    if (!currentSettings.outputPath) {
        showStatus('Please select an output folder first', 'error');
        return;
    }

    if (!currentSettings.selectedDevice) {
        showStatus('Please select a capture device first', 'error');
        return;
    }

    showStatus('Capturing image...', 'info');

    try {
        console.log('=== RENDERER: Calling captureStill API ===');
        const result = await window.electronAPI.captureStill();
        console.log('=== RENDERER: Capture result ===', JSON.stringify(result, null, 2));

        if (result.success) {
            showStatus(`Image captured: ${result.filepath}`, 'success');
        } else {
            showStatus(`Capture failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('=== RENDERER: Capture error ===', error);
        showStatus(`Capture error: ${error.message}`, 'error');
    }
}

async function updateFolderNaming() {
    const convention = elements.folderNaming.value;
    try {
        await window.electronAPI.updateFolderNaming(convention);
        currentSettings.folderNaming = convention;
        showStatus('Folder naming updated', 'success');
    } catch (error) {
        showStatus('Failed to update folder naming', 'error');
    }
}

async function updateRouterIP() {
    const ip = elements.routerIP.value;
    try {
        await window.electronAPI.updateRouterIP(ip);
        currentSettings.routerIP = ip;
        showStatus('Router IP updated', 'success');
    } catch (error) {
        showStatus('Failed to update router IP', 'error');
    }
}

async function updateEosIP() {
    const ip = elements.eosIP.value;
    try {
        await window.electronAPI.updateEosIP(ip);
        currentSettings.eosIP = ip;
        showStatus('Eos IP updated', 'success');
    } catch (error) {
        showStatus('Failed to update Eos IP', 'error');
    }
}

async function updateTCPPort() {
    const port = parseInt(elements.tcpPort.value);
    try {
        await window.electronAPI.updateTCPPort(port);
        currentSettings.tcpPort = port;
        showStatus('TCP port updated', 'success');
    } catch (error) {
        showStatus('Failed to update TCP port', 'error');
    }
}

async function connectEos() {
    if (!currentSettings.eosIP) {
        showStatus('Please enter Eos IP address first', 'error');
        return;
    }

    showStatus('Connecting to Eos...', 'info');
    try {
        const result = await window.electronAPI.connectEos();
        if (result.success) {
            elements.connectEos.disabled = true;
            elements.disconnectEos.disabled = false;
            elements.pingEos.disabled = false;
            elements.eosStatus.textContent = 'Connected to Eos - Listening for cue data...';
            elements.eosStatus.className = 'preview-status active';
            elements.eosDataDisplay.style.display = 'block';
            showStatus('Connected to Eos console', 'success');

            // Get initial data
            updateEosDataDisplay();
        } else {
            elements.eosStatus.textContent = `Connection failed: ${result.error}`;
            elements.eosStatus.className = 'preview-status error';
            showStatus(`Failed to connect to Eos: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus('Failed to connect to Eos', 'error');
    }
}

async function disconnectEos() {
    try {
        await window.electronAPI.disconnectEos();
        elements.connectEos.disabled = false;
        elements.disconnectEos.disabled = true;
        elements.pingEos.disabled = true;
        elements.eosStatus.textContent = 'Disconnected';
        elements.eosStatus.className = 'preview-status';
        elements.eosDataDisplay.style.display = 'none';
        showStatus('Disconnected from Eos', 'success');
    } catch (error) {
        showStatus('Failed to disconnect from Eos', 'error');
    }
}

async function pingEos() {
    try {
        showStatus('Sending ping to Eos...', 'info');
        const result = await window.electronAPI.pingEos();
        if (result.success) {
            showStatus('Ping sent to Eos console', 'success');
        } else {
            showStatus(`Ping failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus('Failed to ping Eos', 'error');
    }
}

async function updateEosDataDisplay() {
    try {
        const eosData = await window.electronAPI.getEosData();
        elements.eosShowValue.textContent = eosData.showName || '-';
        elements.eosCueListValue.textContent = eosData.cueList || '-';
        elements.eosCueNumberValue.textContent = eosData.cueNumber || '-';
        elements.eosCueLabelValue.textContent = eosData.cueLabel || '-';
    } catch (error) {
        console.error('Failed to update Eos data display:', error);
    }
}

async function startTCPServer() {
    showStatus('Starting TCP server...', 'info');
    try {
        const result = await window.electronAPI.startTCPServer();
        if (result.success) {
            elements.startServer.disabled = true;
            elements.stopServer.disabled = false;
            elements.serverStatus.textContent = `Server running on port ${result.port}`;
            elements.serverStatus.className = 'preview-status active';
            showStatus(`TCP server started on port ${result.port}`, 'success');
        } else {
            elements.serverStatus.textContent = `Failed to start: ${result.error}`;
            elements.serverStatus.className = 'preview-status error';
            showStatus(`Failed to start TCP server: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus('Failed to start TCP server', 'error');
    }
}

async function stopTCPServer() {
    try {
        await window.electronAPI.stopTCPServer();
        elements.startServer.disabled = false;
        elements.stopServer.disabled = true;
        elements.serverStatus.textContent = 'Server stopped';
        elements.serverStatus.className = 'preview-status';
        showStatus('TCP server stopped', 'success');
    } catch (error) {
        showStatus('Failed to stop TCP server', 'error');
    }
}

async function switchInput(input, output) {
    try {
        console.log(`Switching Input ${input} to Output ${output}`);
        await window.electronAPI.switchInput(input, output);
        showStatus(`Switched Input ${input} to Output ${output}`, 'success');
    } catch (error) {
        console.error(`Switch error:`, error);
        showStatus(`Failed to switch Input ${input} to Output ${output}: ${error.message}`, 'error');
    }
}

function showStatus(message, type) {
    console.log(`Status: [${type.toUpperCase()}] ${message}`);
    elements.status.innerHTML = message;
    elements.status.className = `status ${type}`;

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            elements.status.innerHTML = '';
            elements.status.className = '';
        }, 8000);
    } else if (type === 'error') {
        setTimeout(() => {
            elements.status.innerHTML = '';
            elements.status.className = '';
        }, 15000);
    }
}

async function loadDevices() {
    try {
        showStatus('Detecting video devices...', 'info');
        const devices = await window.electronAPI.detectDevices();

        elements.captureDevice.innerHTML = '<option value="">Select a device...</option>';

        if (devices.length === 0) {
            showStatus('No video devices detected. Install FFmpeg or connect device.', 'error');
            return;
        }

        let errorDevices = 0;
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = JSON.stringify(device);

            if (device.error) {
                option.textContent = `⚠️ ${device.name}`;
                option.style.color = '#FF3B30';
                option.style.fontStyle = 'italic';
                option.disabled = true;
                errorDevices++;
            } else {
                option.textContent = device.name;
            }

            elements.captureDevice.appendChild(option);
        });

        // Restore selected device from settings
        if (currentSettings.selectedDevice) {
            const selectedValue = JSON.stringify(currentSettings.selectedDevice);
            const matchingOption = Array.from(elements.captureDevice.options).find(
                opt => opt.value === selectedValue
            );
            if (matchingOption) {
                elements.captureDevice.value = selectedValue;
            } else {
                // Device no longer available, select first available
                if (devices.length > 0 && !devices[0].error) {
                    elements.captureDevice.value = JSON.stringify(devices[0]);
                    await onDeviceChange();
                }
            }
        } else if (devices.length > 0 && !devices[0].error) {
            // No saved device, select first available
            elements.captureDevice.value = JSON.stringify(devices[0]);
            await onDeviceChange();
        }

        const workingDevices = devices.length - errorDevices;
        if (workingDevices > 0) {
            showStatus(`Found ${workingDevices} working video device(s)`, 'success');
        } else {
            showStatus('No working video devices found. Check connections and drivers.', 'error');
        }
    } catch (error) {
        console.error('Error loading devices:', error);
        showStatus('Failed to detect devices', 'error');
    }
}


async function refreshDevices() {
    await loadDevices();
}


async function startPreview() {
    try {
        // Check if Blackmagic device is selected - skip preview for Blackmagic
        const selectedValue = elements.captureDevice.value;
        if (selectedValue && selectedValue !== '') {
            try {
                const device = JSON.parse(selectedValue);
                if (device.isBlackmagic) {
                    elements.previewStatus.textContent = 'Preview disabled for Blackmagic devices (use capture to test)';
                    elements.previewStatus.className = 'preview-status';
                    isPreviewActive = false;
                    return;
                }
            } catch (e) {
                // Continue with normal preview
            }
        }

        elements.previewStatus.textContent = 'Starting preview...';
        elements.previewStatus.className = 'preview-status';

        let deviceId = null;

        if (selectedValue && selectedValue !== '') {
            try {
                const device = JSON.parse(selectedValue);
                if (device.name) {
                    // Match by device name (FFmpeg and browser APIs have different indices)
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(d => d.kind === 'videoinput');

                    console.log('Browser video devices:', videoDevices.map(d => d.label));
                    console.log('Looking for device:', device.name);

                    // Find matching device by name (try exact match first, then partial match)
                    let matchingDevice = videoDevices.find(d => d.label === device.name);

                    if (!matchingDevice) {
                        // Try normalized comparison (case-insensitive, trimmed)
                        const normalizedTarget = device.name.toLowerCase().trim();
                        matchingDevice = videoDevices.find(d =>
                            d.label.toLowerCase().trim() === normalizedTarget
                        );
                    }

                    if (matchingDevice) {
                        deviceId = matchingDevice.deviceId;
                        console.log(`Matched device "${device.name}" to browser device "${matchingDevice.label}" (${deviceId})`);
                    } else {
                        console.log(`Could not find device "${device.name}" in browser devices:`, videoDevices.map(d => d.label));
                    }
                }
            } catch (e) {
                console.log('Could not parse selected device, using default');
            }
        }

        const constraints = {
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: false
        };

        previewStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.previewVideo.srcObject = previewStream;

        // Detect framerate from video track
        const videoTrack = previewStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        if (settings.frameRate) {
            let rawFps = settings.frameRate;

            // Map to standard framerates (20fps minimum)
            if (rawFps < 20) {
                detectedFramerate = 30; // Default fallback
            } else if (rawFps >= 23.9 && rawFps < 24.1) {
                detectedFramerate = 24;
            } else if (rawFps >= 23.95 && rawFps < 23.99) {
                detectedFramerate = 23.98; // 23.976 rounded
            } else if (rawFps >= 29.9 && rawFps < 30.1) {
                detectedFramerate = 30;
            } else if (rawFps >= 29.95 && rawFps < 29.99) {
                detectedFramerate = 29.97;
            } else {
                detectedFramerate = Math.round(rawFps * 100) / 100; // Round to 2 decimals
            }

            console.log(`Detected framerate: ${rawFps}fps, using: ${detectedFramerate}fps`);
            await window.electronAPI.setFramerate(detectedFramerate);
            elements.previewStatus.textContent = `Preview active (${detectedFramerate}fps)`;
        } else {
            elements.previewStatus.textContent = 'Preview active';
        }
        elements.previewStatus.className = 'preview-status active';

        isPreviewActive = true;

    } catch (error) {
        console.error('Preview error:', error);
        elements.previewStatus.textContent = `Preview failed: ${error.message}`;
        elements.previewStatus.className = 'preview-status error';

        if (error.name === 'NotAllowedError') {
            elements.previewStatus.textContent = 'Camera access denied. Please allow camera access in System Preferences.';
        } else if (error.name === 'NotFoundError') {
            elements.previewStatus.textContent = 'Selected camera not found. Try refreshing devices.';
        }
    }
}

function stopPreview() {
    if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        previewStream = null;
    }

    elements.previewVideo.srcObject = null;
    elements.previewStatus.textContent = '';
    elements.previewStatus.className = 'preview-status';

    isPreviewActive = false;
}

async function onDeviceChange() {
    const selectedValue = elements.captureDevice.value;

    if (selectedValue === '') {
        currentSettings.selectedDevice = null;
        await window.electronAPI.selectDevice(null);
        showStatus('No device selected', 'info');
        stopPreview();
    } else {
        try {
            const device = JSON.parse(selectedValue);
            currentSettings.selectedDevice = device;
            await window.electronAPI.selectDevice(device);
            showStatus(`Selected device: ${device.name}`, 'success');

            // Restart preview
            stopPreview();
            setTimeout(() => startPreview(), 500);
        } catch (error) {
            console.error('Error selecting device:', error);
            showStatus('Failed to select device', 'error');
        }
    }
}


function initEventListeners() {
    document.getElementById('selectPath').addEventListener('click', selectOutputPath);
    elements.namingConvention.addEventListener('change', updateNamingConvention);
    elements.folderNaming.addEventListener('change', updateFolderNaming);
    elements.routerIP.addEventListener('change', updateRouterIP);
    elements.eosIP.addEventListener('change', updateEosIP);
    elements.tcpPort.addEventListener('change', updateTCPPort);
    elements.connectEos.addEventListener('click', connectEos);
    elements.disconnectEos.addEventListener('click', disconnectEos);
    elements.pingEos.addEventListener('click', pingEos);
    elements.startServer.addEventListener('click', startTCPServer);
    elements.stopServer.addEventListener('click', stopTCPServer);
    elements.captureDevice.addEventListener('change', onDeviceChange);
    elements.refreshDevices.addEventListener('click', refreshDevices);

    // Update preview when naming conventions change
    elements.namingConvention.addEventListener('input', updateNamingPreviews);
    elements.folderNaming.addEventListener('input', updateNamingPreviews);

    // Listen for Eos status updates from main process
    window.electronAPI.onEosStatusUpdate((eosData) => {
        console.log('Eos status update received:', eosData);

        // Update currentEosData tracking
        currentEosData = { ...eosData };

        if (eosData.connected) {
            let statusText = `Connected | Cue List: ${eosData.cueList || 'N/A'} | Cue: ${eosData.cueNumber || 'N/A'} | Label: ${eosData.cueLabel || 'N/A'}`;
            elements.eosStatus.textContent = statusText;
            elements.eosStatus.className = 'preview-status active';

            // Update the data display
            elements.eosShowValue.textContent = eosData.showName || '-';
            elements.eosCueListValue.textContent = eosData.cueList || '-';
            elements.eosCueNumberValue.textContent = eosData.cueNumber || '-';
            elements.eosCueLabelValue.textContent = eosData.cueLabel || '-';
        }

        // Update naming preview with new Eos data
        updateNamingPreviews();
    });

    // Listen for TCP server status updates
    window.electronAPI.onTCPServerStatus((status) => {
        if (status.running) {
            elements.startServer.disabled = true;
            elements.stopServer.disabled = false;
            elements.serverStatus.textContent = `Server running on port ${status.port}`;
            elements.serverStatus.className = 'preview-status active';
        } else {
            elements.startServer.disabled = false;
            elements.stopServer.disabled = true;
            if (status.error) {
                elements.serverStatus.textContent = `Error: ${status.error}`;
                elements.serverStatus.className = 'preview-status error';
            } else {
                elements.serverStatus.textContent = 'Server stopped';
                elements.serverStatus.className = 'preview-status';
            }
        }
    });
}

async function runTestSequence(inputs = [1,2,3,4,5,6]) {
    if (!currentSettings.outputPath) {
        showStatus('Please select an output folder first', 'error');
        return;
    }

    if (!currentSettings.selectedDevice) {
        showStatus('Please select a capture device first', 'error');
        return;
    }

    showStatus(`Starting test sequence for Output 1 (Inputs ${inputs.join(',')})...`, 'info');

    try {
        const result = await window.electronAPI.runTestSequence(inputs);
        if (result.success) {
            showStatus(`Test sequence complete! ${result.captured} of ${result.total} captures succeeded.`, 'success');
        } else {
            showStatus(`Test sequence failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Test sequence error: ${error.message}`, 'error');
    }
}

async function init() {
    initElements();
    initEventListeners();
    await loadSettings();
    await loadDevices();
    await startPreview();

    // Listen for sequence progress updates
    window.electronAPI.onSequenceProgress((progress) => {
        showStatus(progress.message, progress.type || 'info');
    });
}

init();