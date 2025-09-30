# Nostalgia Box Controller - Claude Development Log

## Project Overview
An Electron application for controlling Blackmagic Videohub mini 6x2 router, capturing stills via Blackmagic UltraStudio Recorder 3G, and integrating with ETC Eos lighting consoles and Stream Deck Companion for automated capture workflows.

## Current Status: ✅ WORKING (v1.1.0)
Full integration complete. Capture, preview, ETC Eos OSC integration, and Stream Deck automation working.

## Features Implemented

### ✅ Core Architecture
- Electron app with main/renderer process separation
- Secure IPC communication via preload script
- Built for macOS ARM64 systems

### ✅ User Interface
- Clean, native macOS-style interface
- Organized sections for different functionality
- Real-time status feedback

### ✅ Configuration Management
- **Router Settings**: Configurable Videohub IP address (default: 10.101.130.101)
- **ETC Eos Settings**: IP address configuration for OSC connection (port 3032)
- **Stream Deck Settings**: TCP server port configuration (default: 9999)
- **Output Settings**: File destination picker, folder naming, and file naming conventions
- **Naming Variables**:
  - `{input}` - Input number (1-6)
  - `{timestamp}` - Current date/time
  - `{eosCueList}` - ETC Eos cue list number
  - `{eosCueLabel}` - ETC Eos cue label/name
  - `{eosCueNumber}` - ETC Eos cue number
  - `{eosShowName}` - ETC Eos show name

### ✅ Router Control
- Individual input switching test buttons (Input 1-6)
- Configurable IP address for Videohub connection
- Telnet communication on port 9990
- Real-time switching feedback

### ✅ Device Detection & Selection
- FFmpeg-based device discovery with multiple path detection
- Dropdown menu for device selection (FaceTime cameras, UltraStudio, etc.)
- Auto-detect and manual device selection options
- Real-time device refresh functionality

### ✅ Live Preview Feature
- Browser-based live video preview using getUserMedia()
- Always-on preview (automatically starts on device selection)
- Device-specific preview that switches when selection changes
- Preview disabled for Blackmagic devices (they require exclusive FFmpeg access)
- Framerate detection from preview (supports 23.98, 24, 29.97, 30fps)
- Clean preview UI with status indicators and error handling

### ✅ Capture Functionality
- FFmpeg-based still capture via UltraStudio Recorder 3G and other devices
- Multiple capture method fallbacks (device index, name, first available)
- Framerate detection and optimization (tries detected rate first, then fallbacks)
- Device name matching between browser and FFmpeg APIs
- Automatic folder creation based on naming convention
- Automatic file naming with ETC Eos and timestamp variables
- PNG output format, configurable output directory and folder structure
- Native resolution capture (format/resolution/framerate agnostic)

### ✅ ETC Eos Integration (NEW in v1.1.0)
- **OSC Communication**: Connects to ETC Eos consoles via OSC over TCP (port 3032)
- **Real-time Data**: Subscribes to active cue information
- **Variables Available**:
  - Show name
  - Cue list number
  - Cue number
  - Cue label/name
- **UI Status Display**: Real-time connection status and cue information
- **File Naming Integration**: All Eos variables available in file/folder naming

### ✅ Stream Deck Companion Integration (NEW in v1.1.0)
- **TCP Server**: Listens for commands from Stream Deck Companion
- **Sequence Automation**: Process comma-separated input sequences (e.g., "1,2,6")
- **Automated Workflow**:
  1. Receives sequence command from Stream Deck
  2. For each input: switches router → waits → captures image
  3. Returns real-time feedback to Stream Deck
- **Folder Organization**: Each sequence creates a dated folder with all captures
- **Error Handling**: Continues sequence even if individual captures fail
- **Configurable Port**: Default 9999, customizable in UI

### ✅ Build System
- Electron Builder configuration
- DMG package output for distribution
- Self-contained app bundle with all dependencies
- No Node.js/npm required for end users

## Technical Implementation

### Key Files
- `src/main.js` - Main Electron process, router control, capture logic
- `src/renderer.js` - UI logic and event handling
- `src/preload.js` - Secure IPC bridge
- `src/index.html` - User interface
- `package.json` - Dependencies and build configuration

### Dependencies
- `electron` - Application framework
- `node-osc` - OSC message handling
- `electron-builder` - Packaging system

### Hardware Requirements
- Blackmagic Videohub mini 6x2 router (optional)
- Blackmagic UltraStudio Recorder 3G (target device)
- macOS ARM64 system
- FFmpeg installed via Homebrew

## Usage Instructions

### Development
```bash
npm install
npm start          # Run in development
npm run dev        # Run with dev tools
npm run build      # Build distributable .app
```

### End User
1. Install FFmpeg: `brew install ffmpeg`
2. Install from DMG: `dist/Nostalgia Box Controller-1.1.0-arm64.dmg`
3. **Configure Output**: Set output folder, folder naming, and file naming conventions
4. **Select Device**: Choose capture device from dropdown
5. **Preview**: Starts automatically (except for Blackmagic devices)
6. **Manual Capture**: Click "Capture Image" to capture still frame
7. **ETC Eos Integration** (Optional):
   - Enter Eos console IP address
   - Click "Connect to Eos"
   - Real-time cue info appears in status display
   - Cue variables automatically populate in file/folder names
8. **Stream Deck Automation** (Optional):
   - Click "Start Server" to enable TCP server
   - Configure Stream Deck Companion with TCP connection to port 9999
   - Send sequences like "1,2,6" to automate multi-input captures

## Technical Notes

### Router Communication
- Uses netcat (nc) for telnet communication
- Command format: `VIDEO OUTPUT ROUTING:\n{output} {input}\n\n`
- Port 9990 (standard Videohub telnet port)

### Capture Implementation
- FFmpeg command: `ffmpeg -f avfoundation -framerate {fps} -i "{device_index}" -frames:v 1 -update 1 "{filepath}"`
- Framerate optimization: Tries detected framerate first, then 30, 29.97, 24, 23.98 fps
- Multiple device detection methods (selected device index, fallback methods)
- FFmpeg path discovery (system PATH, Homebrew locations)
- Single frame capture to JPEG with timestamp naming
- Native device resolution (no scaling or format conversion)
- Error handling for device connectivity and framerate issues

### Device Detection
- Searches multiple FFmpeg installation paths (/opt/homebrew/bin, /usr/local/bin, system PATH)
- Parses AVFoundation device list output
- Supports all AVFoundation devices: UltraStudio Recorder 3G, FaceTime cameras, Continuity Camera, screen capture
- Real-time device enumeration and selection
- Device name matching between FFmpeg and browser getUserMedia APIs

### ETC Eos OSC Integration
- **Protocol**: OSC over TCP (port 3032 for sending, port 3033 for receiving)
- **Connection**: Uses `node-osc` library for OSC client/server
- **Subscription**: Sends `/eos/subscribe=1` to receive updates
- **Monitored Paths**:
  - `/eos/out/active/cue/text` - Active cue label
  - `/eos/out/active/cue/{list}/{number}` - Cue list and number
  - `/eos/out/show/name` - Show name
- **State Tracking**: Real-time updates sent to renderer via IPC
- **Variable Replacement**: Replaces variables in file/folder names during capture
- **Fallback Values**: Uses "unknown" if Eos not connected or data unavailable

### Stream Deck TCP Server
- **Protocol**: Raw TCP socket server (default port 9999)
- **Command Format**: Comma-separated input numbers (e.g., "1,2,6")
- **Response**: Real-time text feedback sent back to client
- **Sequence Logic**:
  1. Parse and validate input sequence (1-6 only)
  2. For each input: switch router → 500ms delay → capture → 500ms delay
  3. Creates subfolder with timestamp/Eos data
  4. Continues on error, reports failures
- **Concurrency Protection**: Only one sequence runs at a time
- **Stream Deck Companion Setup**: Use "Generic TCP" module pointing to app IP:port

### Folder and File Naming
- **Folder Naming**: Creates subfolders in output path based on template
- **File Naming**: Supports all variables including Eos data
- **Variable Replacement Order**: Applied during capture, not configuration
- **Folder Creation**: Automatic recursive folder creation (mkdir -p equivalent)
- **Default Templates**:
  - Folder: `{eosCueList}_{timestamp}_{eosCueLabel}_{eosCueNumber}`
  - File: `{eosCueList}_{timestamp}_{input}_{eosCueLabel}_{eosCueNumber}`
- **Output Format**: PNG images with native resolution

## Future Enhancements
- Multiple output routing
- Video format capture options
- Batch processing queues
- Configuration file import/export
- Network device discovery
- Status monitoring dashboard

## Commands to Remember
```bash
# Development
npm run dev

# Build for distribution
npm run build

# Package location
dist/Nostalgia Box Controller-1.1.0-arm64.dmg
```

## Restore Point - v1.1.0 (Working State - With Eos & Stream Deck Integration)

### ✅ All Features Working
- Device detection and dropdown population (all AVFoundation devices)
- Live preview for non-Blackmagic devices (FaceTime, Continuity Camera, etc.)
- Preview disabled for Blackmagic devices (they require exclusive FFmpeg access)
- Still frame capture working for ALL devices including Blackmagic UltraStudio Recorder 3G
- Router control (if Videohub hardware available)
- Settings persistence across sessions (including new Eos/TCP settings)
- FFmpeg path discovery and installation validation
- Framerate detection and optimization
- **ETC Eos OSC integration** with real-time cue tracking
- **Stream Deck TCP server** for automated sequence capture
- **Folder/file naming** with Eos variables and automatic folder creation

### 🔑 Key Technical Details
1. **Blackmagic Device Handling**:
   - Preview is disabled for Blackmagic devices (browser and FFmpeg can't access simultaneously)
   - FFmpeg has exclusive access for proper HDMI input capture
   - Shows "Preview disabled for Blackmagic devices (use capture to test)" message

2. **Device Name Matching**:
   - FFmpeg device indices don't match browser getUserMedia device indices
   - Uses device name matching with normalized comparison (case-insensitive, trimmed)
   - Fallback to first available device if name match fails

3. **Framerate Detection**:
   - Detects from preview using videoTrack.getSettings().frameRate
   - Rounds to standard rates: 23.98, 24, 29.97, 30fps
   - Falls back to common rates if detection fails
   - Tries detected rate first during capture for speed

4. **FFmpeg Command Format**:
   - Critical flags: `-framerate {fps}` before input, `-frames:v 1 -update 1` for single frame
   - Uses device index (not name) in FFmpeg command
   - Native resolution, no scaling or format conversion

### 📝 Important Implementation Notes
- `isBlackmagic` flag set during device detection (checks if name contains "blackmagic")
- Preview automatically restarts when switching between devices (except Blackmagic)
- Capture uses selected device index with framerate fallback strategy
- Settings stored include: outputPath, namingConvention, folderNaming, routerIP, eosIP, tcpPort, selectedDevice, detectedFramerate
- **Eos Connection**: OSC client sends to port 3032, OSC server listens on port 3033
- **TCP Server**: Listens on configurable port (default 9999), handles multiple connections
- **Sequence Protection**: `isSequenceRunning` flag prevents concurrent sequences
- **Folder Creation**: Happens during capture, not configuration change
- **Variable Replacement**: Applied to both folder name and file name during each capture

### 🎯 Stream Deck Companion Setup
To use with Stream Deck Companion:
1. Start TCP server in app (default port 9999)
2. In Companion, add connection: **Generic TCP/UDP**
3. Set target IP to Mac's IP address (or localhost)
4. Set port to 9999
5. Add button with "Send TCP" action
6. Enter sequence like: `1,2,6`
7. Button press will trigger automated sequence

## Last Updated
v1.1.0 - Full integration complete. ETC Eos OSC and Stream Deck automation working. All core functionality operational.