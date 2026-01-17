let currentSettings = {
    outputPath: '',
    stitchedOutputPath: '',
    namingConvention: '{date}_{eosCueListName}_{eosCueLabel}_{input}',
    folderNaming: '{date}_{eosCueListName}_{eosCueLabel}',
    routerIP: '10.101.130.101',
    eosIP: '',
    tcpPort: 9999
};

let lastCaptureFolder = '';

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
    currentStitchedPath: null,
    namingConvention: null,
    folderNaming: null,
    stitchLayoutMode: null,
    routerIP: null,
    eosIP: null,
    tcpPort: null,
    connectEos: null,
    disconnectEos: null,
    pingEos: null,
    eosStatus: null,
    folderPreview: null,
    filePreview: null,
    startServer: null,
    stopServer: null,
    serverStatus: null,
    captureDevice: null,
    refreshDevices: null,
    status: null
};

// Diagnostics tracking
let appStartTime = Date.now();
let connectionCount = 0;

// Helper functions for naming preview
function sanitizeFilename(str) {
    // Ensure str is a string (convert null/undefined/numbers to string)
    const stringValue = String(str ?? '');
    return stringValue
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
    elements.currentStitchedPath = document.getElementById('currentStitchedPath');
    elements.namingConvention = document.getElementById('namingConvention');
    elements.folderNaming = document.getElementById('folderNaming');
    elements.stitchLayoutMode = document.getElementById('stitchLayoutMode');
    elements.routerIP = document.getElementById('routerIP');
    elements.eosIP = document.getElementById('eosIP');
    elements.tcpPort = document.getElementById('tcpPort');
    elements.connectEos = document.getElementById('connectEos');
    elements.disconnectEos = document.getElementById('disconnectEos');
    elements.pingEos = document.getElementById('pingEos');
    elements.eosStatus = document.getElementById('eosStatus');
    elements.folderPreview = document.getElementById('folderPreview');
    elements.filePreview = document.getElementById('filePreview');
    elements.startServer = document.getElementById('startServer');
    elements.stopServer = document.getElementById('stopServer');
    elements.serverStatus = document.getElementById('serverStatus');
    elements.captureDevice = document.getElementById('captureDevice');
    elements.refreshDevices = document.getElementById('refreshDevices');
    elements.status = document.getElementById('status');
}

async function loadSettings() {
    try {
        currentSettings = await window.electronAPI.getSettings();
        elements.currentPath.textContent = currentSettings.outputPath || 'No folder selected';
        elements.currentStitchedPath.textContent = currentSettings.stitchedOutputPath || 'No folder selected';
        elements.namingConvention.value = currentSettings.namingConvention;
        elements.folderNaming.value = currentSettings.folderNaming;
        elements.stitchLayoutMode.value = currentSettings.stitchLayoutMode || 'auto';
        elements.routerIP.value = currentSettings.routerIP;
        elements.eosIP.value = currentSettings.eosIP || '';
        elements.tcpPort.value = currentSettings.tcpPort || 9999;

        // Initialize naming preview
        updateNamingPreviews();

        // Update status indicators
        updateStatusIndicators();
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
            updateStatusIndicators();
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

async function updateStitchLayoutMode() {
    const mode = elements.stitchLayoutMode.value;
    try {
        await window.electronAPI.updateStitchLayoutMode(mode);
        currentSettings.stitchLayoutMode = mode;
        showStatus(`Stitch layout mode set to: ${mode}`, 'success');
    } catch (error) {
        showStatus('Failed to update stitch layout mode', 'error');
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
            showStatus('Connected to Eos console', 'success');
            connectionCount++;
            updateDiagnostics();
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
        showStatus('Disconnected from Eos', 'success');
        connectionCount = Math.max(0, connectionCount - 1);
        updateDiagnostics();
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
            connectionCount++;
            updateDiagnostics();
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
        connectionCount = Math.max(0, connectionCount - 1);
        updateDiagnostics();
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

    // Also update activity indicator
    updateActivityIndicator(message);

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

function updateActivityIndicator(message) {
    const indicator = document.getElementById('activityIndicator');
    if (indicator) {
        indicator.textContent = message;

        // Add animation/pulse effect
        indicator.style.opacity = '1';
        indicator.style.transition = 'opacity 0.3s';

        // Fade out after 10 seconds
        setTimeout(() => {
            indicator.style.opacity = '0.5';
        }, 10000);
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



async function onDeviceChange() {
    const selectedValue = elements.captureDevice.value;

    if (selectedValue === '') {
        currentSettings.selectedDevice = null;
        await window.electronAPI.selectDevice(null);
        showStatus('No device selected', 'info');
        updateStatusIndicators();
    } else {
        try {
            const device = JSON.parse(selectedValue);
            currentSettings.selectedDevice = device;
            await window.electronAPI.selectDevice(device);
            showStatus(`Selected device: ${device.name}`, 'success');
            updateStatusIndicators();
        } catch (error) {
            console.error('Error selecting device:', error);
            showStatus('Failed to select device', 'error');
        }
    }
}


async function selectStitchedOutputPath() {
    try {
        const path = await window.electronAPI.selectStitchedOutputPath();
        if (path) {
            currentSettings.stitchedOutputPath = path;
            elements.currentStitchedPath.textContent = path;
            showStatus('Stitched output path updated', 'success');
            updateStatusIndicators();
        }
    } catch (error) {
        showStatus('Failed to select stitched output path', 'error');
    }
}


function initEventListeners() {
    document.getElementById('selectPath').addEventListener('click', selectOutputPath);
    document.getElementById('selectStitchedPath').addEventListener('click', selectStitchedOutputPath);
    elements.namingConvention.addEventListener('change', updateNamingConvention);
    elements.folderNaming.addEventListener('change', updateFolderNaming);
    elements.stitchLayoutMode.addEventListener('change', updateStitchLayoutMode);
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

    // Multi-input capture listeners
    const inputButtons = document.querySelectorAll('.input-select-button');
    inputButtons.forEach(button => {
        button.addEventListener('click', toggleInputSelection);
    });
    document.getElementById('captureSequenceButton').addEventListener('click', captureSelectedInputs);

    // Update preview when naming conventions change
    elements.namingConvention.addEventListener('input', updateNamingPreviews);
    elements.folderNaming.addEventListener('input', updateNamingPreviews);

    // Listen for Eos status updates from main process
    window.electronAPI.onEosStatusUpdate((eosData) => {
        console.log('Eos status update received:', eosData);

        // Update currentEosData tracking
        currentEosData = { ...eosData };

        if (eosData.connected) {
            const cueListName = eosData.cueListName || eosData.cueList || 'N/A';
            let statusText = `Connected | Cue: ${eosData.cueNumber || 'N/A'} | Cue List Label: ${cueListName} | Label: ${eosData.cueLabel || 'N/A'}`;
            elements.eosStatus.textContent = statusText;
            elements.eosStatus.className = 'preview-status active';
        }

        // Update naming preview with new Eos data
        updateNamingPreviews();

        // Update status indicators
        updateStatusIndicators();
    });

    // Listen for TCP server status updates
    window.electronAPI.onTCPServerStatus((status) => {
        const streamDeckStatus = document.getElementById('streamDeckStatus');

        if (status.running) {
            elements.startServer.disabled = true;
            elements.stopServer.disabled = false;
            elements.serverStatus.textContent = `Server running on port ${status.port}`;
            elements.serverStatus.className = 'preview-status active';
            streamDeckStatus.className = 'status-indicator green';
        } else {
            elements.startServer.disabled = false;
            elements.stopServer.disabled = true;
            if (status.error) {
                elements.serverStatus.textContent = `Error: ${status.error}`;
                elements.serverStatus.className = 'preview-status error';
                streamDeckStatus.className = 'status-indicator red';
            } else {
                elements.serverStatus.textContent = 'Server stopped';
                elements.serverStatus.className = 'preview-status';
                streamDeckStatus.className = 'status-indicator gray';
            }
        }
    });
}


function updateStatusIndicators() {
    // Output Settings - green if both paths are set
    const outputStatus = document.getElementById('outputSettingsStatus');
    if (currentSettings.outputPath && currentSettings.outputPath !== '' &&
        currentSettings.stitchedOutputPath && currentSettings.stitchedOutputPath !== '') {
        outputStatus.className = 'status-indicator green';
    } else if (currentSettings.outputPath && currentSettings.outputPath !== '') {
        outputStatus.className = 'status-indicator orange';
    } else {
        outputStatus.className = 'status-indicator gray';
    }

    // Capture Device - green if device selected
    const captureDeviceStatus = document.getElementById('captureDeviceStatus');
    if (currentSettings.selectedDevice) {
        captureDeviceStatus.className = 'status-indicator green';
    } else {
        captureDeviceStatus.className = 'status-indicator gray';
    }

    // Router Settings - green if router IP is set
    const routerSettingsStatus = document.getElementById('routerSettingsStatus');
    if (currentSettings.routerIP && currentSettings.routerIP !== '') {
        routerSettingsStatus.className = 'status-indicator green';
    } else {
        routerSettingsStatus.className = 'status-indicator gray';
    }

    // ETC Eos - green if connected, red if disconnected/error, gray if not configured
    const eosStatus = document.getElementById('eosSettingsStatus');
    if (currentEosData.connected) {
        eosStatus.className = 'status-indicator green';
    } else if (currentSettings.eosIP && currentSettings.eosIP !== '') {
        eosStatus.className = 'status-indicator red';
    } else {
        eosStatus.className = 'status-indicator gray';
    }

    // Stream Deck - green if server running, gray otherwise
    // This will be updated via the TCP server status callback
}

function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + 'Content');
    const arrow = document.getElementById(sectionId + 'Arrow');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        arrow.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
        arrow.classList.add('expanded');
    }
}

// Particle Animation
let particleCanvas = null;
let particleCtx = null;
let particles = [];
let animationFrame = null;

class Particle {
    constructor(canvas) {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.1; // Very slow drift
        this.vy = (Math.random() - 0.5) * 0.1; // No gravity, random direction
        this.radius = Math.random() * 3 + 1; // Varying sizes 1-4px
        this.opacity = Math.random() * 0.4 + 0.2; // Subtle opacity 0.2-0.6
        this.targetVx = this.vx;
        this.targetVy = this.vy;
        this.changeTimer = Math.random() * 200;
    }

    update(canvas) {
        // Smooth velocity changes for organic motion
        this.changeTimer--;
        if (this.changeTimer <= 0) {
            this.targetVx = (Math.random() - 0.5) * 0.15;
            this.targetVy = (Math.random() - 0.5) * 0.15;
            this.changeTimer = Math.random() * 200 + 100;
        }

        // Gradually move towards target velocity
        this.vx += (this.targetVx - this.vx) * 0.02;
        this.vy += (this.targetVy - this.vy) * 0.02;

        // Brownian motion jitter
        const jitterX = (Math.random() - 0.5) * 0.2;
        const jitterY = (Math.random() - 0.5) * 0.2;

        this.x += this.vx + jitterX;
        this.y += this.vy + jitterY;

        // Wrap around edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.fill();
    }
}

function initParticleAnimation() {
    particleCanvas = document.getElementById('particleCanvas');
    if (!particleCanvas) return;

    particleCanvas.width = particleCanvas.offsetWidth;
    particleCanvas.height = particleCanvas.offsetHeight;
    particleCtx = particleCanvas.getContext('2d');

    // Create particles
    particles = [];
    for (let i = 0; i < 90; i++) {
        particles.push(new Particle(particleCanvas));
    }

    animateParticles();
}

function animateParticles() {
    if (!particleCtx || !particleCanvas) return;

    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    particles.forEach(particle => {
        particle.update(particleCanvas);
        particle.draw(particleCtx);
    });

    // No connection lines for dust effect

    animationFrame = requestAnimationFrame(animateParticles);
}

function stopParticleAnimation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function updateDiagnostics() {
    const uptimeElement = document.getElementById('uptimeValue');
    const statusElement = document.getElementById('systemStatus');
    const statusDot = document.getElementById('statusDot');
    const showNameElement = document.getElementById('showName');
    const cueListDisplay = document.getElementById('cueListDisplay');
    const cueDisplay = document.getElementById('cueDisplay');
    const connectionCountElement = document.getElementById('connectionCount');

    if (uptimeElement) {
        const uptime = Date.now() - appStartTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);
        uptimeElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Update connection count
    if (connectionCountElement) {
        connectionCountElement.textContent = connectionCount;
    }

    // Update status pill and dot based on connection status
    if (statusElement && statusDot) {
        if (currentEosData.connected && connectionCount > 0) {
            statusElement.textContent = 'Active';
            statusElement.style.color = '#34C759';
            statusDot.style.backgroundColor = '#34C759';
            statusDot.style.boxShadow = '0 0 6px #34C759';
        } else if (connectionCount > 0) {
            statusElement.textContent = 'Connecting';
            statusElement.style.color = '#FF9500';
            statusDot.style.backgroundColor = '#FF9500';
            statusDot.style.boxShadow = '0 0 6px #FF9500';
        } else {
            statusElement.textContent = 'Inactive';
            statusElement.style.color = '#FF3B30';
            statusDot.style.backgroundColor = '#FF3B30';
            statusDot.style.boxShadow = '0 0 6px #FF3B30';
        }
    }

    // Update show name
    if (showNameElement) {
        showNameElement.textContent = currentEosData.showName || '-';
    }

    // Update cue list and cue display
    if (cueListDisplay && cueDisplay) {
        const cueListName = currentEosData.cueListName || currentEosData.cueList || '-';
        const cueLabel = currentEosData.cueLabel || '-';
        cueListDisplay.textContent = cueListName;
        cueDisplay.textContent = cueLabel;
    }
}

// Update diagnostics every second
setInterval(updateDiagnostics, 1000);

function toggleInputSelection(event) {
    const button = event.target;
    button.classList.toggle('selected');
}

async function captureSelectedInputs() {
    const selectedButtons = document.querySelectorAll('.input-select-button.selected');

    if (selectedButtons.length === 0) {
        showStatus('Please select at least one input to capture', 'error');
        return;
    }

    // Get selected input numbers
    const inputs = Array.from(selectedButtons).map(btn => parseInt(btn.dataset.input)).sort((a, b) => a - b);

    showStatus(`Starting capture sequence: ${inputs.join(', ')}`, 'info');

    // Disable capture button during sequence
    const captureButton = document.getElementById('captureSequenceButton');
    captureButton.disabled = true;
    captureButton.textContent = 'Capturing...';

    try {
        const result = await window.electronAPI.runTestSequence(inputs);

        if (result.success) {
            showStatus(`Sequence complete: ${result.captured} captured, ${result.failed} failed`, 'success');
        } else {
            showStatus(`Sequence failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Capture error: ${error.message}`, 'error');
    } finally {
        captureButton.disabled = false;
        captureButton.textContent = 'Capture Selected Inputs';
    }
}

async function init() {
    initElements();
    initEventListeners();
    await loadSettings();
    await loadDevices();

    // Start particle animation immediately
    setTimeout(() => initParticleAnimation(), 100);

    // Auto-connect to Eos if IP is configured
    if (currentSettings.eosIP && currentSettings.eosIP.trim() !== '') {
        console.log('Auto-connecting to Eos...');
        setTimeout(async () => {
            await connectEos();
        }, 1000);
    }

    // Listen for sequence progress updates
    window.electronAPI.onSequenceProgress((progress) => {
        showStatus(progress.message, progress.type || 'info');
    });

    // Listen for TCP commands to update UI selection
    window.electronAPI.onTCPCommandReceived((inputs) => {
        updateInputSelection(inputs);
    });

    // Listen for capture status updates
    window.electronAPI.onCaptureStatus((status) => {
        updateCaptureStatus(status);
    });

    // Start diagnostics update
    updateDiagnostics();
}

function updateCaptureStatus(status) {
    const pill = document.getElementById('captureStatusPill');
    const text = document.getElementById('captureStatusText');

    if (!pill || !text) return;

    if (status.capturing) {
        pill.style.display = 'flex';
        text.textContent = `Capturing Input ${status.input} (${status.current}/${status.total})`;
    } else {
        pill.style.display = 'none';
    }
}

function updateInputSelection(inputs) {
    // Clear all selections first
    const allButtons = document.querySelectorAll('.input-select-button');
    allButtons.forEach(btn => btn.classList.remove('selected'));

    // Select the inputs from the TCP command
    inputs.forEach(inputNumber => {
        const button = document.querySelector(`.input-select-button[data-input="${inputNumber}"]`);
        if (button) {
            button.classList.add('selected');
        }
    });

    showStatus(`TCP command received: ${inputs.join(', ')}`, 'info');
}

init();