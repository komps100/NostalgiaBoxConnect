# Nostalgia Box Controller - Claude Development Log

## Project Overview
A Electron application for controlling Blackmagic Videohub mini 6x2 router and capturing stills via Blackmagic UltraStudio Recorder 3G. The app provides device selection, live preview, and image capture functionality.

## Current Status: ✅ WORKING (v1.0.1)
Core functionality complete. Capture and preview working for all devices.

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
- **Router Settings**: Configurable Videohub IP address (default: localhost)
- **Output Settings**: File destination picker, custom naming conventions
- **Naming Variables**: `{input}` for input number, `{timestamp}` for date/time

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
- Automatic file naming with timestamps
- JPEG output format, configurable output directory
- Native resolution capture (format/resolution/framerate agnostic)

### ❌ Removed Features (Simplified)
- OSC Network Integration (removed for simplicity)
- Sequence Automation (removed for simplicity)
- Multiple input routing (simplified to single capture)

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
2. Install from DMG: `dist/Nostalgia Box Controller-1.0.1-arm64.dmg`
3. Set output folder and naming convention
4. Select capture device from dropdown
5. Preview starts automatically (except for Blackmagic devices)
6. Click "Capture Image" to capture still frame from selected device

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

## Future Enhancements (Not Implemented)
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
dist/Nostalgia Box Controller-1.0.1-arm64.dmg
```

## Restore Point - v1.0.1 (Working State)

### ✅ All Features Working
- Device detection and dropdown population (all AVFoundation devices)
- Live preview for non-Blackmagic devices (FaceTime, Continuity Camera, etc.)
- Preview disabled for Blackmagic devices (they require exclusive FFmpeg access)
- Still frame capture working for ALL devices including Blackmagic UltraStudio Recorder 3G
- Router control (if Videohub hardware available)
- Settings persistence across sessions
- FFmpeg path discovery and installation validation
- Framerate detection and optimization

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
- Settings stored include: outputPath, namingConvention, routerIP, selectedDevice, detectedFramerate

## Last Updated
v1.0.1 - All core functionality working. Preview and capture operational for all device types.