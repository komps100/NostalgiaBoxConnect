# Nostalgia Box Controller - Claude Development Log

## Project Overview
An Electron application for controlling Blackmagic Videohub mini 6x2 router, capturing stills via Blackmagic UltraStudio Recorder 3G, and integrating with ETC Eos lighting consoles and Stream Deck Companion for automated capture workflows.

## Current Status: ✅ WORKING (v1.6.1)
All features working. Clean, minimal UI with purple gradient design, ambient particle animation, multi-input capture interface, streamlined settings interface, ETC Eos OSC integration (TCP-only with 500ms delays), auto-reconnect, and unified TCP/IP remote control with 10-second timeout protection.

### Quick Start for Next Session

#### Current State Summary
- ✅ **100% Functional** - Core capture and control features working
- ✅ **Clean UI** - Simplified interface focused on essential controls
- ✅ **Purple Gradient Theme** - Cohesive design with ambient particle animation
- ✅ **Unified Capture Logic** - Manual and network triggers use identical code path
- ✅ **Timeout Protection** - 10-second automatic timeout prevents hanging

#### Latest Build
- **File**: `dist/Nostalgia Box Controller-1.6.1-arm64.dmg`
- **Major Changes**: Unified capture logic for manual/network triggers, 10-second timeout, reverted to v1.3 proven capture method
- **Breaking Change**: None - all features maintained and improved

#### Recent Major Update (v1.6.1)
- **What Changed**: Unified manual button and network trigger code paths, added 10-second timeout, removed broken file polling logic
- **Why**: Manual button was using different code than network triggers causing conflicts and state corruption
- **Result**: Both manual UI button and TCP/network triggers now use identical, reliable capture logic with timeout protection

#### Key Files
- `src/main.js` - Main process, capture, OSC, TCP server
- `src/imageProcessor.js` - **NEW** Sharp-based stitching with grid layouts
- `src/processedFilesLog.js` - **NEW** Tracks processed image groups
- `src/renderer.js` - UI logic and event handling
- `src/index.html` - Collapsible UI sections
- `src/preload.js` - IPC bridge

#### Dependencies
- `sharp` - **NEW** Image processing (stitching)
- `osc` - OSC packet encoding/decoding
- `node-osc` - Legacy OSC support
- `electron` - Framework
- `electron-builder` - Packaging

## Features Implemented

### ✅ Core Architecture
- Electron app with main/renderer process separation
- Secure IPC communication via preload script
- Built for macOS ARM64 systems

### ✅ User Interface (v1.4.0)
- Clean, minimal interface with purple gradient theme (#667eea to #764ba2)
- Ambient particle animation (slow-drift style) in status display
- **Multi-Input Capture Section**: Visual interface with 6 selectable input buttons
- Collapsible settings sections (all hidden by default on launch)
- Status indicators (green/red/gray/orange dots) for each system component
- Real-time show/cue information display with uptime and connection count (fixed in v1.4.0)
- Status messages appear directly under main display (not at bottom)
- Improved spacing and consistent button padding (8px 16px)

### ✅ Configuration Management
- **Router Settings**: Configurable Videohub IP address (default: 10.101.130.101)
- **ETC Eos Settings**: IP address configuration for OSC connection (port 3032)
- **Stream Deck Settings**: TCP server port configuration (default: 9999)
- **Output Settings**: File destination picker, folder naming, and file naming conventions
- **Naming Variables**:
  - `{date}` - Date only in YYYYMMDD format (e.g., 20250930)
  - `{input}` - Input number (1-6)
  - `{timestamp}` - Current date/time (full timestamp)
  - `{eosCueList}` - ETC Eos cue list number
  - `{eosCueListName}` - ETC Eos cue list name (text label)
  - `{eosCueLabel}` - ETC Eos cue label/name (clean text only)
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

### ✅ Test Sequences (NEW in v1.1.0)
- **Pre-configured Test Buttons**: Common input combinations (Input 6, Inputs 1-6, 1,2,6, 1,2,3,6, 1,2,3,4,6, 1,2,3,4,5,6)
- **Automated Workflow**: For each input: switch router → wait → capture → wait
- **Retry Logic**: 2 attempts per input with 1001ms timeout per attempt
- **Skip on Failure**: Automatically skips inputs with no video source
- **Folder Tracking**: Tracks capture folder from first successful capture
- **Auto-Stitch**: Automatically stitches captured images after sequence completes
- **Progress Feedback**: Real-time status updates for each step

### ✅ Image Stitching (NEW in v1.1.0)
- **Auto-Stitch After Sequences**: Stitches images automatically after test sequences complete
- **Manual Stitch Button**: "Stitch Latest Folder" button to stitch on demand
- **Latest Folder Detection**: Finds most recent folder by modification time
- **Sharp-based Processing**: Uses Sharp library for reliable, fast image composition
- **Grid Layouts**:
  - 2 images: Side by side (2x1)
  - 3 images: 2 top, 1 centered bottom (2x2 grid with black background)
  - 4 images: 2x2 grid (white background)
  - 5 images: 3 top, 2 centered bottom (3x2 grid with black background)
  - 6 images: 3x2 grid (white background)
- **Smart Backgrounds**: Black for odd counts (3,5), white for even counts (2,4,6)
- **No Quality Loss**: Full resolution JPEG output at quality 100
- **Separate Output**: Stitched images saved to configurable destination folder
- **Filename Format**: `{folderName}.jpg` (no "_stitched" suffix)
- **Duplicate Handling**: Files get `_(2)`, `_(3)`, etc. suffix if name exists
- **Processed Files Log**: Tracks processed groups to avoid reprocessing

### ✅ ETC Eos Integration (NEW in v1.1.0)
- **OSC Communication**: Connects to ETC Eos consoles via OSC over TCP only (port 3032)
- **TCP-Only Protocol**: Uses raw TCP sockets with OSC packet-length framing (no UDP)
- **Auto-Connect on Launch**: Automatically connects to EOS when app starts
- **Auto-Reconnect**: Smart reconnection (10s intervals for first 2min, then 30s)
- **Real-time Data**: Subscribes to active cue information
- **Sequential OSC Get Commands with Delays**:
  - Waits for active cue notification before sending any Get commands
  - Adds 500ms delay before requesting cuelist info (`/eos/get/cuelist/{number}`)
  - Waits for cuelist response before proceeding
  - Adds 500ms delay before requesting cue info (`/eos/get/cue/{list}/{number}`)
  - Retrieves clean text labels (cue list name from args[2], cue label from args[2])
  - **Total ~1s delay between commands improves reliability and fixes "3.0" label issue**
- **Variables Available**:
  - Show name
  - Cue list number and name (text label)
  - Cue number and label (clean text only, no formatting)
- **UI Status Display**: Real-time connection status and cue information
- **File Naming Integration**: All Eos variables available in file/folder naming
- **Naming Preview**: Live preview of folder/file names with current Eos data
- **Filename Sanitization**: Removes invalid characters (`/ \ : * ? " < > | ,`) but preserves spaces

### ✅ Multi-Input Capture UI (NEW in v1.4.0)
- **Visual Input Selection**: 6 clickable buttons (Input 1-6) below status display
- **Toggle Selection**: Click to select/deselect inputs with purple gradient highlighting
- **Capture Button**: Triggers automated sequence for all selected inputs
- **Real-time Feedback**: Progress updates and status messages during capture
- **Timeout Protection**: Uses 1001ms timeout per input with auto-skip on failure (fixed in v1.4.0)
- **TCP Command Sync**: UI automatically updates to show inputs from last TCP command (NEW in v1.4.0)
- **Unified Interface**: Same automation logic as TCP/Stream Deck remote control

### ✅ Stream Deck Companion Integration (v1.1.0, enhanced in v1.4.0)
- **TCP Server**: Listens for commands from Stream Deck Companion
- **Auto-Start**: Automatically starts 5 seconds after successful EOS connection
- **Auto-Stop**: Automatically stops when EOS disconnects
- **Sequence Automation**: Process comma-separated input sequences (e.g., "1,2,6")
- **Visual Feedback**: UI input buttons update to show last TCP command received (NEW in v1.4.0)
- **Automated Workflow**:
  1. Receives sequence command from Stream Deck
  2. Updates UI to show selected inputs (v1.4.0)
  3. For each input: switches router → waits → captures image (with 1001ms timeout)
  4. Auto-stitches all captured images into composite
  5. Returns real-time feedback to Stream Deck
- **Folder Organization**: Each sequence creates a dated folder with all captures and stitched image
- **Error Handling**: Continues sequence even if individual captures fail (improved in v1.4.0)
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
- `node-osc` - OSC message handling (legacy, kept for compatibility)
- `osc` - OSC packet encoding/decoding for TCP-only communication
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
- **Protocol**: OSC over TCP only (port 3032, bidirectional)
- **Connection**: Raw `net.Socket()` with manual OSC packet-length framing (OSC 1.0 spec)
- **Framing**: 4-byte big-endian length header + OSC packet data
- **Packet Encoding**: Uses `osc` library for writePacket/readPacket
- **Subscription**: Sends `/eos/subscribe` with argument `1` to receive updates
- **Sequential OSC Get Flow**:
  - Waits for `/eos/out/active/cue/{list}/{number}` before sending Get commands
  - Sends `/eos/get/cuelist/{number}` first and stores pending cue request
  - Waits for `/eos/out/get/cuelist/{number}` response
  - Then sends `/eos/get/cue/{list}/{number}` after receiving cuelist response
  - Extracts cue list name from args[2] (not args[3] which is role/user info)
  - Extracts cue label from args[2] (clean label without timing/intensity)
- **Monitored Paths**:
  - `/eos/out/active/cue/text` - Active cue formatted text (parsed for clean label)
  - `/eos/out/active/cue/{list}/{number}` - Cue list and number (triggers Get sequence)
  - `/eos/out/show/name` - Show name
  - `/eos/out/get/cuelist/{number}/list/0/{count}` - Cue list name response (args[2] = name)
  - `/eos/out/get/cue/{list}/{number}/0/list/0/{count}` - Cue label response (args[2] = label)
- **State Tracking**: Real-time updates sent to renderer via IPC
- **Variable Replacement**: Replaces variables in file/folder names during capture
- **Filename Sanitization**: Removes invalid characters: `/ \ : * ? " < > | ,` but preserves spaces
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
  - Folder: `{date}_{eosCueListName}_{eosCueLabel}`
  - File: `{date}_{eosCueListName}_{eosCueLabel}_{input}`
- **Output Format**: PNG images with native resolution
- **Spaces Allowed**: Sanitization removes invalid chars but preserves spaces

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
dist/Nostalgia Box Controller-1.4.0-arm64.dmg
```

## Next Session Focus Areas

### Suggested UI Improvements
- [ ] Simplify collapsible sections (reduce clutter)
- [ ] Consolidate stitch layout mode selector (currently not fully utilized)
- [ ] Improve status indicator visibility
- [ ] Better activity indicator positioning
- [ ] Streamline test sequence buttons layout

### Suggested Program Simplifications
- [ ] Remove unused "line mode" stitching option (only auto mode works)
- [ ] Clean up FFmpeg fallback code (Sharp is now primary)
- [ ] Consolidate duplicate handling functions
- [ ] Simplify settings structure
- [ ] Review and optimize IPC handlers

### Known Technical Debt
- FFmpeg still used for capture (could explore Sharp for this too)
- Some OSC code paths could be simplified
- Settings persistence could be more robust
- Error handling could be more user-friendly

### Performance Optimizations
- Image processor queue could be optimized
- Preview system could be more efficient
- Settings updates could be debounced

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
- **Test sequences** with pre-configured buttons (6, 1-6, 1,2,6, 1,2,3,6, 1,2,3,4,6, 1,2,3,4,5,6)
- **Retry logic** with 1001ms timeout and auto-skip on missing sources
- **Image stitching** (auto-stitch after sequences, manual stitch latest folder)
- **Collapsible UI** with all sections hidden by default
- **Status indicators** (green/red/gray/orange) for all system components
- **Activity indicator** in header showing real-time system status
- **ETC Eos OSC integration** with real-time cue tracking and 500ms command delays
- **Auto-reconnect** (10s for first 2min, then 30s intervals)
- **Stream Deck TCP server** with auto-start 5s after EOS connection
- **Folder/file naming** with Eos variables and automatic folder creation
- **Separate folders** for captures and stitched outputs

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
- Settings stored include: outputPath, stitchedOutputPath, namingConvention, folderNaming, routerIP, eosIP, tcpPort, selectedDevice, detectedFramerate
- **Eos Connection**: OSC client sends to port 3032 with packet-length framing (OSC 1.0 spec)
- **OSC Delays**: 500ms delay before cuelist Get, 500ms delay before cue Get (total ~1s between commands)
- **Auto-Reconnect**: Starts automatically on disconnect, 10s for first 2min, then 30s
- **TCP Server**: Listens on configurable port (default 9999), handles multiple connections
- **TCP Auto-Start**: Starts 5s after EOS connection, stops on EOS disconnect
- **Sequence Protection**: `isSequenceRunning` flag prevents concurrent sequences
- **Folder Creation**: Happens during capture, not configuration change
- **Variable Replacement**: Applied to both folder name and file name during each capture
- **Folder Tracking**: First successful capture in sequence tracks folder for stitching
- **Image Stitching**: FFmpeg filter_complex with hstack (≤6 images) or grid layout (>6 images)
- **Latest Folder Detection**: Scans capture directory, sorts by mtime, stitches most recent

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
v1.6.1 - All features working. Unified capture logic for manual and network triggers, 10-second timeout protection, stable and reliable capture sequences. Clean purple gradient UI with ambient particle animation, Sharp-based image stitching, EOS OSC integration with optimized delays, and Stream Deck remote control.

## Recent Fixes (Latest Build - v1.6.1)
- ✅ **Unified Capture Logic**: Manual UI button and TCP/network triggers now use identical code path (`runSequenceShared()`)
- ✅ **10-Second Timeout**: Automatic timeout cancels and resets any sequence exceeding 10 seconds
- ✅ **Reverted to v1.3 Logic**: Uses proven capture method with direct `captureStill()` calls and 500ms delays
- ✅ **State Management Fix**: Properly manages `isSequenceRunning` flag preventing conflicts between manual and network triggers
- ✅ **Removed Broken Code**: Eliminated `captureWithFilePolling()` and retry logic that was causing single-file captures

## Previous Fixes (v1.4.0)
- ✅ **Connection Counter Display**: Now properly shows number of active connections (EOS + TCP server)
- ✅ **Multi-Input Capture UI**: Added visual interface for selecting and capturing multiple inputs
- ✅ **TCP Command Sync**: UI buttons automatically update to show inputs from last TCP command
- ✅ **Improved Error Handling**: Sequences continue gracefully when inputs have no video source

## Previous Fixes (v1.1.0)
- ✅ **Sharp-Based Stitching**: Replaced FFmpeg with Sharp library for reliable grid layouts
- ✅ **Grid Positioning**: Precise 2x2 and 3x2 layouts with centered positioning for odd counts
- ✅ **Smart Backgrounds**: Black background for odd image counts, white for even
- ✅ **Duplicate Folders**: Automatic (2), (3), etc. suffix for duplicate folder names
- ✅ **Duplicate Files**: Automatic _(2), _(3), etc. suffix for duplicate stitched files
- ✅ **No _stitched Suffix**: Stitched files now use folder name directly
- ✅ **Switch to Input 1**: Sequences automatically switch back to Input 1 when complete
- ✅ **Sequential OSC Flow**: Get commands sent sequentially (cuelist → wait → cue)
- ✅ **OSC Timing Optimization**: Added 500ms delays between OSC commands for reliable data retrieval
- ✅ **Cue Label Reliability**: Increased delays fix intermittent "3.0" label issue
- ✅ **Correct Arg Indices**: Cue list name extracted from args[2] (not args[3])
- ✅ **Spaces Allowed**: Sanitization no longer converts spaces to underscores
- ✅ **Date Variable Added**: `{date}` variable for YYYYMMDD format (e.g., 20250930)
- ✅ **Updated Defaults**: Templates now use `{date}_{eosCueListName}_{eosCueLabel}_{input}`
- ✅ **Test Sequences**: Built-in buttons for common input combinations (6, 1-6, 1,2,6, etc.)
- ✅ **Collapsible UI**: All sections hideable by default with expand/collapse arrows
- ✅ **Status Indicators**: Green/red/gray/orange dots show system component status
- ✅ **Activity Indicator**: Real-time one-line status tracking in header
- ✅ **Auto-Reconnect**: Smart EOS reconnection (10s for first 2min, then 30s intervals)
- ✅ **TCP Auto-Start**: Stream Deck server starts automatically 5s after EOS connection
- ✅ **Retry Logic**: Capture timeout at 1001ms per attempt, auto-skips missing sources

## Confirmed Working (v1.6.1)
- ✅ **Capture**: Working for all devices (Blackmagic UltraStudio, FaceTime, etc.)
- ✅ **Router Switching**: Videohub control working, auto-switch to Input 1 after sequences
- ✅ **Manual Capture**: UI button uses same reliable logic as network triggers
- ✅ **Network Triggers**: TCP/Stream Deck sequences work perfectly with 10s timeout
- ✅ **Unified Logic**: Both manual and network paths use identical `runSequenceShared()` function
- ✅ **Sharp Grid Stitching**: Reliable 2x2 and 3x2 layouts with precise positioning
- ✅ **Auto-Stitch**: Automatically stitches after sequences complete
- ✅ **Manual Stitch**: "Stitch Latest Folder" button finds and stitches most recent folder
- ✅ **Duplicate Handling**: Folders get (2), (3) suffix; files get _(2), _(3) suffix
- ✅ **Eos OSC**: TCP-only communication with 500ms delays, reliable label extraction
- ✅ **Eos Auto-Reconnect**: Smart reconnection (10s for 2min, then 30s intervals)
- ✅ **Stream Deck TCP**: Server auto-starts 5s after EOS, auto-stops on disconnect
- ✅ **Timeout Protection**: All sequences automatically cancelled after 10 seconds
- ✅ **Collapsible UI**: All sections expandable/collapsible with status indicators
- ✅ **Activity Indicator**: Real-time status tracking in header
- ✅ **Filename Sanitization**: Removes invalid chars, preserves spaces
- ✅ **Naming Preview**: Live preview updates with current Eos data
- ✅ **Separate Folders**: Capture and stitched output folders independent
- ✅ **Processed Files Log**: Tracks stitched groups to avoid reprocessing

## Restore Point - v1.3.0 (Working State - UI Redesign)

### ✅ What Changed in v1.3.0
**UI Redesign:**
- Removed test sequences UI (functionality still in main.js)
- Removed capture control section
- Removed router control section from UI
- Removed preview functionality
- Status messages now appear under main display (not at bottom)
- Renamed "Stream Deck Control" to "TCP/IP Remote Control"

**Visual Design:**
- Added purple gradient theme throughout (#667eea to #764ba2)
- Implemented ambient particle animation in status display
- Ambient drift style: slow, omnidirectional movement with smooth velocity transitions
- 90 particles with varying sizes (1-4px) and opacity (0.2-0.6)
- No connecting lines between particles

**Status Display:**
- Particle animation canvas (220px height) as background
- Show name displayed prominently (28px, left-aligned with padding)
- Cue list and cue labels in italics below show name
- Status pill (Active/Connecting/Inactive) on right with color-coded dot inside
- Uptime and connection count centered at bottom
- Real-time updates every second

**Improved Spacing:**
- All buttons use consistent 8px 16px padding
- 10px margin below folder labels and input fields
- Better vertical spacing throughout

### 🎨 Design Details
**Purple Gradient:**
- Primary: #667eea (blue-purple)
- Secondary: #764ba2 (deeper purple)
- Applied to: body background, buttons, input focus states

**Particle Animation:**
- Type: Ambient Drift
- Count: 90 particles
- Speed: Very slow (0.1 base velocity)
- Motion: Smooth velocity changes every 100-300 frames
- Effect: Brownian jitter for natural organic movement
- No gravity or directional bias

**Status Colors:**
- Green (#34C759): Active/Connected
- Orange (#FF9500): Connecting
- Red (#FF3B30): Inactive/Error
- Gray (#8E8E93): Not configured

### 📋 UI Sections (Collapsible)
1. **Output Settings** - Folder paths and naming conventions
2. **Capture Device** - Device selection dropdown
3. **Router Settings** - Videohub IP configuration
4. **ETC EOS Integration** - Console IP and connection
5. **TCP/IP Remote Control** - TCP server settings

### ✅ Core Functionality Maintained
- Device detection and capture still working
- EOS OSC integration unchanged
- TCP/IP remote control unchanged
- Router control via API (just UI removed)
- All backend features preserved

### 📦 Build Info
- **Version**: 1.3.0
- **File**: `dist/Nostalgia Box Controller-1.3.0-arm64.dmg`
- **Changes**: UI-only redesign, no breaking changes
- **Dependencies**: Same as v1.1.0 (sharp, osc, electron)

## Restore Point - v1.4.0 (Working State - Multi-Input Capture & Fixes)

### ✅ What Changed in v1.4.0
**Bug Fixes:**
- **Connection Counter Fixed**: Now properly displays number of active connections (EOS + TCP server)
- **TCP Command Timeout Fixed**: Changed from potential 30s hang to 1001ms timeout with auto-skip on missing inputs
- Uses `captureWithRetry()` instead of direct `captureStill()` for TCP commands

**New Features:**
- **Multi-Input Capture UI**: Visual interface for selecting and capturing multiple inputs
  - 6 clickable input buttons (Input 1-6) below status display
  - Toggle selection with purple gradient highlighting
  - "Capture Selected Inputs" button triggers automated sequence
  - Button disabled during capture with "Capturing..." status
  - Real-time progress updates and status messages
  - Same retry logic and timeout protection as test sequences

- **TCP Command Visual Feedback**: UI automatically updates to show inputs from last TCP command
  - Receives TCP command → clears previous selections → highlights matching inputs
  - Status message: "TCP command received: 1, 2, 6"
  - Provides visual confirmation of what Stream Deck/external system requested

### 🎯 Technical Changes
**Main Process (main.js):**
- Line 755-757: Added IPC send to update renderer when TCP command received
- Line 785: Changed TCP handler to use `captureWithRetry()` for timeout protection

**Renderer Process (renderer.js):**
- Line 711-713: Added connection count display update in `updateDiagnostics()`
- Line 759-762: Added `toggleInputSelection()` function for button clicks
- Line 764-796: Added `captureSelectedInputs()` function for sequence automation
- Line 821-823: Added listener for TCP command updates
- Line 829-843: Added `updateInputSelection()` to sync UI with TCP commands

**Preload (preload.js):**
- Line 31: Added `onTCPCommandReceived` IPC bridge

**UI (index.html):**
- Lines 351-420: Added CSS for multi-input capture section
- Lines 463-475: Added HTML for input selector buttons and capture button

### 📦 Build Info
- **Version**: 1.4.0
- **File**: `dist/Nostalgia Box Controller-1.4.0-arm64.dmg`
- **Changes**: Multi-input capture UI, connection counter fix, TCP timeout improvements
- **Dependencies**: Same as v1.3.0 (sharp, osc, electron)
- **Breaking Changes**: None - all features maintained and improved

## Restore Point - v1.6.1 (STABLE - Unified Capture Logic)

### ✅ What Changed in v1.6.1
**Critical Bug Fixes:**
- **Unified Capture Logic**: Manual UI button and TCP/network triggers now use identical code path
  - Previous issue: Manual button used `runTestSequence()` with `captureWithRetry()`, TCP used direct `captureStill()`
  - Different code paths caused state conflicts and `isSequenceRunning` flag corruption
  - Solution: Created shared `runSequenceShared()` function used by both paths

- **10-Second Timeout Protection**: Automatic cancellation prevents hanging
  - Wraps sequence in `Promise.race()` with 10-second timeout
  - Automatically resets `isSequenceRunning` flag on timeout
  - Prevents state corruption from hung sequences

- **Reverted to v1.3 Proven Logic**: Removed broken experimental code
  - Removed `captureWithFilePolling()` (was causing single-file captures)
  - Removed `captureWithRetry()` (was causing conflicts)
  - Back to direct `captureStill()` calls with 500ms delays (proven working)

### 🎯 Technical Changes
**Main Process (main.js):**
- Line 248-255: Updated IPC handler to use `runSequenceShared()` instead of `runTestSequence()`
- Line 745-762: Added `runSequenceShared()` wrapper function with 10s timeout protection
- Line 764-851: Added `executeSequence()` shared logic for both manual and network triggers
- Line 853-856: Simplified TCP handler to use `runSequenceShared()`
- Removed: Entire `runTestSequence()` function (replaced with shared logic)
- Removed: `captureWithFilePolling()` broken implementation

**Sequence Flow (Both Paths):**
```
Manual Button → runSequenceShared() → executeSequence()
TCP Network   → runSequenceShared() → executeSequence()
                      ↓
        Identical logic with 10s timeout
```

**Capture Method:**
- Direct `captureStill()` calls (no retry wrapper)
- 500ms delay after router switch
- 500ms delay before next input
- Auto-stitch after all captures
- Switch back to Input 1

### 📦 Build Info
- **Version**: 1.6.1
- **File**: `dist/Nostalgia Box Controller-1.6.1-arm64.dmg`
- **Changes**: Unified capture logic, 10-second timeout, removed broken code
- **Dependencies**: Same as v1.4.0 (sharp, osc, electron)
- **Breaking Changes**: None - all features working better

### ✅ Confirmed Working
- ✅ Manual capture button works reliably
- ✅ TCP/network triggers work reliably
- ✅ No more conflicts between manual and network paths
- ✅ 10-second timeout prevents all hanging
- ✅ State management (`isSequenceRunning`) properly handled
- ✅ All 6 inputs capture correctly
- ✅ Auto-stitch works
- ✅ Switch back to Input 1 works
- ✅ EOS integration works
- ✅ Stream Deck integration works