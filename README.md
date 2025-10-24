# Nostalgia Box Controller

A professional macOS application for controlling Blackmagic Videohub routers, capturing stills from video devices, and integrating with ETC Eos lighting consoles for automated theatrical capture workflows.

## Features

### Video Capture
- **Still Frame Capture**: Capture high-quality PNG images from any AVFoundation-compatible device
- **Device Support**:
  - Blackmagic UltraStudio Recorder 3G (HDMI input capture)
  - Built-in FaceTime cameras
  - External USB cameras
  - Continuity Camera
  - Screen capture devices
- **Live Preview**: Real-time preview for most devices (disabled for Blackmagic devices to avoid conflicts)
- **Native Resolution**: Captures at device's native resolution with automatic framerate detection

### Router Control
- **Blackmagic Videohub**: Control Blackmagic Videohub mini 6x2 router
- **Manual Switching**: Individual buttons for routing any input (1-6) to any output (1-2)
- **Network Control**: Connect via IP address (configurable, default: 10.101.130.101)

### ETC Eos Integration
- **Real-time Cue Tracking**: Connects to ETC Eos lighting consoles via OSC
- **Auto-Connect**: Automatically connects on launch, no manual intervention needed
- **Auto-Reconnect**: Smart reconnection logic (10s intervals for first 2 minutes, then 30s)
- **Sequential OSC Commands**: Optimized delays (500ms) between commands for reliable data retrieval
- **Automatic File Naming**: Use cue information in folder and file names
- **Available Variables**:
  - `{date}` - Date only in YYYYMMDD format (e.g., 20250930)
  - `{eosShowName}` - Show name
  - `{eosCueList}` - Cue list number
  - `{eosCueListName}` - Cue list name (text label)
  - `{eosCueNumber}` - Cue number
  - `{eosCueLabel}` - Cue label (clean text)
- **Live Preview**: See how your folder and file names will appear with current Eos data
- **TCP Connection**: Reliable OSC over TCP (port 3032)

### Multi-Input Capture (Enhanced in v1.6.1)
- **Visual Input Selection**: 6 clickable buttons (Input 1-6) for selecting multiple inputs
- **Toggle Selection**: Click to select/deselect inputs with purple gradient highlighting
- **Capture Button**: "Capture Selected Inputs" triggers automated sequence for all selected inputs
- **Real-time Feedback**: Progress updates and status messages during capture
- **Unified Logic**: Uses identical code path as TCP/network triggers for reliability (v1.6.1)
- **10-Second Timeout**: Automatic cancellation prevents hanging sequences (v1.6.1)
- **Automatic Stitching**: After sequence completes, images are automatically stitched into a single composite
- **Stable & Reliable**: No more conflicts between manual and network triggers (v1.6.1)

### Stream Deck Automation (Enhanced in v1.7.0)
- **TCP Server**: Listens for commands from Elgato Stream Deck Companion
- **Auto-Start**: TCP server starts automatically 5 seconds after EOS connection
- **Sequence Automation**: Send comma-separated input sequences (e.g., "1,2,6")
- **Remote Shutdown** (NEW in v1.7.0): Send `SHUTDOWN72842069` command to close all applications and shut down computer
- **Unified Logic**: Uses same reliable code path as manual UI button (v1.6.1)
- **10-Second Timeout**: Automatic timeout prevents sequences from hanging (v1.6.1)
- **Automated Workflow**:
  1. Stream Deck sends sequence command
  2. App switches router to each input (500ms settle time)
  3. Captures image for each input
  4. Auto-stitches captured images into composite
  5. Organizes all files in a timestamped folder
  6. Auto-cancels if sequence exceeds 10 seconds (v1.6.1)
- **Shutdown Workflow** (NEW in v1.7.0):
  1. Stream Deck sends `SHUTDOWN72842069` command
  2. App closes all applications (except Nostalgia Box Controller, Finder, System Events)
  3. Waits 2 seconds for graceful closure
  4. Initiates macOS system shutdown
- **Configurable Port**: Default 9999, customizable in settings

### Image Stitching (Sharp-based)
- **Automatic Stitching**: After test sequences complete, images are auto-stitched
- **Manual Stitching**: Button to stitch latest capture folder on demand
- **Precise Grid Layouts**:
  - 2 images: Side by side (2x1)
  - 3 images: 2 on top, 1 centered below (black background)
  - 4 images: Perfect 2x2 grid (white background)
  - 5 images: 3 on top, 2 centered below (black background)
  - 6 images: Perfect 3x2 grid (white background)
- **Smart Backgrounds**: Black for odd image counts, white for even
- **No Quality Loss**: Full resolution JPEG output (quality 100)
- **Duplicate Handling**: Automatic `_(2)`, `_(3)` suffixes for duplicate files
- **Processed Files Log**: Tracks stitched groups to avoid reprocessing
- **Separate Output**: Stitched images saved to configurable destination folder

### File Organization
- **Smart Naming**: Customize folder and file naming with variables
- **Default Folder Template**: `{date}_{eosCueListName}_{eosCueLabel}`
- **Default File Template**: `{date}_{eosCueListName}_{eosCueLabel}_{input}`
- **Additional Variables**:
  - `{date}` - Date only in YYYYMMDD format (e.g., 20250930)
  - `{input}` - Input number (1-6)
  - `{timestamp}` - Current date/time (full timestamp)
- **Duplicate Handling**:
  - Folders: Automatic `(2)`, `(3)`, etc. suffix (e.g., `20251001_CueList_Label (2)`)
  - Stitched files: Automatic `_(2)`, `_(3)`, etc. suffix (e.g., `20251001_CueList_Label_(2).jpg`)
- **Automatic Sanitization**: Invalid filename characters automatically replaced, spaces preserved
- **Live Preview**: See how your files will be named before capturing
- **Auto-Switch to Input 1**: After sequences complete, router automatically switches back to Input 1

## System Requirements

- macOS (Apple Silicon / ARM64)
- FFmpeg installed via Homebrew (`brew install ffmpeg`) - for video capture only
- Blackmagic Videohub mini 6x2 (optional, for router control)
- Blackmagic UltraStudio or compatible capture device (optional, for video capture)
- ETC Eos lighting console (optional, for Eos integration)
- Elgato Stream Deck Companion (optional, for automation)

**Note**: Image stitching uses the built-in Sharp library (no additional dependencies needed)

## Installation

1. **Install FFmpeg**:
   ```bash
   brew install ffmpeg
   ```

2. **Install Nostalgia Box Controller**:
   - Download the DMG from the releases page
   - Open `Nostalgia Box Controller-1.7.0-arm64.dmg`
   - Drag the app to your Applications folder
   - Right-click the app and select "Open" (first launch only, due to code signing)

## Quick Start

### Basic Capture Workflow

1. **Configure Output Folder**:
   - Click "Select Folder" in the Output Settings section
   - Choose where you want images saved

2. **Select Capture Device**:
   - Choose your video device from the dropdown
   - Preview will start automatically (if supported)

3. **Capture Images**:
   - Click "Capture Image" button
   - Images are saved as PNG files in your output folder

### With ETC Eos Integration

1. **Connect to Eos**:
   - Enter your Eos console IP address
   - Click "Connect to Eos"
   - Wait for connection confirmation

2. **Configure Naming**:
   - Customize folder naming template (or use default)
   - Customize file naming template (or use default)
   - Watch the preview update with current cue data

3. **Capture with Cue Data**:
   - Images automatically include cue information in filenames
   - Folders organized by cue list and cue label

### With Stream Deck Automation

1. **Start TCP Server**:
   - Click "Start Server" in the Stream Deck Control section
   - Note the port number (default: 9999)

2. **Configure Stream Deck Companion**:
   - Add a "Generic TCP/UDP" connection
   - Set target IP to your Mac's IP address
   - Set port to 9999
   - Create button with "Send TCP" action
   - Enter sequence like: `1,2,6`

3. **Run Automated Sequences**:
   - Press Stream Deck button
   - App automatically switches and captures each input
   - All images saved in a timestamped folder

4. **Remote Shutdown** (NEW in v1.7.0):
   - Create Stream Deck button with "Send TCP" action
   - Enter command: `SHUTDOWN72842069`
   - Press button to close all apps and shut down Mac
   - Useful for end-of-show automated shutdown

### Advanced: Dynamic Input Selection with Companion 4.0

Instead of hardcoded sequences, use **Companion 4.0's expression variables** for dynamic input control:

**Setup**:
1. Create 6 custom variables: `rec1`, `rec2`, `rec3`, `rec4`, `rec5`, `rec6` (values: "0" or "1")
2. Create toggle buttons that set these variables when pressed
3. Create two expression variables:

**Expression Variable: `sendTCP`** (builds the TCP command):
```javascript
concat($(custom:rec1) == '1' ? '1' : '', $(custom:rec1) == '1' && $(custom:rec2) == '1' ? ',' : '', $(custom:rec2) == '1' ? '2' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1') && $(custom:rec3) == '1' ? ',' : '', $(custom:rec3) == '1' ? '3' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1') && $(custom:rec4) == '1' ? ',' : '', $(custom:rec4) == '1' ? '4' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1' || $(custom:rec4) == '1') && $(custom:rec5) == '1' ? ',' : '', $(custom:rec5) == '1' ? '5' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1' || $(custom:rec4) == '1' || $(custom:rec5) == '1') && $(custom:rec6) == '1' ? ',' : '', $(custom:rec6) == '1' ? '6' : '')
```

**Expression Variable: `capture_label`** (displays human-readable labels):
```javascript
concat('Capturing: ', $(custom:rec1) == '1' ? 'A' : '', $(custom:rec1) == '1' && $(custom:rec2) == '1' ? ' ' : '', $(custom:rec2) == '1' ? 'B' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1') && $(custom:rec3) == '1' ? ' ' : '', $(custom:rec3) == '1' ? 'C' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1') && $(custom:rec4) == '1' ? ' ' : '', $(custom:rec4) == '1' ? 'D' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1' || $(custom:rec4) == '1') && $(custom:rec5) == '1' ? ' ' : '', $(custom:rec5) == '1' ? 'W' : '', ($(custom:rec1) == '1' || $(custom:rec2) == '1' || $(custom:rec3) == '1' || $(custom:rec4) == '1' || $(custom:rec5) == '1') && $(custom:rec6) == '1' ? ' ' : '', $(custom:rec6) == '1' ? 'M' : '')
```

**Usage**:
- **Execute button**: Send `$(expression:sendTCP)` via TCP
- **Button text**: Display `$(expression:capture_label)` for visual feedback
- **Example output**: `Capturing: A B M` for inputs 1, 2, and 6

**Input to letter mapping**: 1=A, 2=B, 3=C, 4=D, 5=W, 6=M

## Usage Tips

### Naming Conventions

The naming preview shows how your files will be named with current data. Experiment with different templates to find what works best for your workflow.

**Good folder naming examples**:
- `{date}_{eosCueListName}_{eosCueLabel}` - Date with cue list and label (default)
- `{date}_{eosShowName}` - Organized by date and show
- `{eosCueListName}_{eosCueLabel}` - Simple cue organization

**Good file naming examples**:
- `{date}_{eosCueListName}_{eosCueLabel}_{input}` - Full naming (default)
- `{date}_{input}_{eosCueLabel}` - Date with input and cue label
- `{eosCueListName}_{input}_{eosCueNumber}` - Cue info with input

### Blackmagic Devices

- Preview is disabled for Blackmagic devices to allow FFmpeg exclusive access
- Use the "Capture Image" button to test if your device is working
- Ensure HDMI signal is present before capturing

### Router Control

- Test individual input/output combinations with the manual buttons
- Outputs are labeled 1-2 (corresponding to Videohub outputs)
- Verify IP address matches your Videohub (default: 10.101.130.101)

## Troubleshooting

**No devices detected**:
- Ensure FFmpeg is installed: `brew install ffmpeg`
- Check device is connected and powered on
- Try "Refresh Devices" button

**Preview not working**:
- Grant camera permissions in System Preferences > Privacy & Security > Camera
- Preview is disabled for Blackmagic devices (this is normal)

**Capture fails**:
- Verify FFmpeg is installed: `ffmpeg -version`
- Check device is not in use by another application
- For Blackmagic: ensure HDMI signal is present

**Eos connection fails**:
- Verify Eos console IP address is correct
- Ensure OSC is enabled on Eos console
- Check network connectivity between Mac and Eos

**Stream Deck not triggering**:
- Verify TCP server is started (green status indicator)
- Check port number matches in Companion
- Ensure Mac and Stream Deck are on same network

## Development

### Requirements
- Node.js (v16 or later)
- npm

### Setup
```bash
npm install
```

### Run in Development
```bash
npm start          # Standard mode
npm run dev        # With dev tools
```

### Build Distributable
```bash
npm run build
```

Output: `dist/Nostalgia Box Controller-1.7.0-arm64.dmg`

## Technical Details

- **Framework**: Electron 30.x
- **OSC Protocol**: OSC over TCP (port 3032) with sequential Get commands and 500ms delays for reliability
- **Video Capture**: FFmpeg with AVFoundation
- **Capture Logic**: Unified code path for manual and network triggers (v1.6.1)
  - Direct `captureStill()` calls with 500ms delays
  - 10-second timeout protection
  - Shared `runSequenceShared()` function for both UI and TCP paths
- **Image Stitching**: Sharp library for precise grid layouts and compositing
  - Grid positioning: 2x1, 2x2, 3x2 layouts
  - Smart backgrounds: Black for odd counts, white for even
  - JPEG output at quality 100
  - Processed files log for tracking
- **Router Protocol**: Telnet (port 9990)
- **Architecture**: Secure IPC with main/renderer process separation
- **UI Design**: Purple gradient theme with ambient particle animation
  - Multi-input capture interface with visual selection
  - Collapsible settings sections with status indicators
  - Real-time show/cue display with uptime and connection count
  - Ambient drift particle animation (90 particles, slow organic movement)
- **File Naming**: Invalid chars removed, spaces preserved, automatic duplicate handling
- **Dependencies**: `sharp`, `osc`, `node-osc` (legacy)

## License

Copyright 2024-2025. All rights reserved.

## Support

For issues, feature requests, or questions, please contact the development team.

---

**Version**: 1.7.0
**Build**: `Nostalgia Box Controller-1.7.0-arm64.dmg`
**Last Updated**: October 2025
**Major Update**: Remote shutdown command for automated computer shutdown via TCP, unified capture logic, 10-second timeout protection
