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
- **Automatic File Naming**: Use cue information in folder and file names
- **Available Variables**:
  - `{eosShowName}` - Show name
  - `{eosCueList}` - Cue list number
  - `{eosCueListName}` - Cue list name (text label)
  - `{eosCueNumber}` - Cue number
  - `{eosCueLabel}` - Cue label (clean text)
- **Live Preview**: See how your folder and file names will appear with current Eos data
- **TCP Connection**: Reliable OSC over TCP (port 3032)

### Stream Deck Automation
- **TCP Server**: Listens for commands from Elgato Stream Deck Companion
- **Sequence Automation**: Send comma-separated input sequences (e.g., "1,2,6")
- **Automated Workflow**:
  1. Stream Deck sends sequence command
  2. App switches router to each input
  3. Captures image for each input
  4. Organizes all captures in a timestamped folder
- **Configurable Port**: Default 9999, customizable in settings

### File Organization
- **Smart Naming**: Customize folder and file naming with variables
- **Default Folder Template**: `{eosCueListName}_{timestamp}_{eosCueLabel}_{eosCueNumber}`
- **Default File Template**: `{eosCueListName}_{timestamp}_{input}_{eosCueLabel}_{eosCueNumber}`
- **Additional Variables**:
  - `{input}` - Input number (1-6)
  - `{timestamp}` - Current date/time
- **Automatic Sanitization**: Invalid filename characters automatically replaced
- **Live Preview**: See how your files will be named before capturing

## System Requirements

- macOS (Apple Silicon / ARM64)
- FFmpeg installed via Homebrew (`brew install ffmpeg`)
- Blackmagic Videohub mini 6x2 (optional, for router control)
- Blackmagic UltraStudio or compatible capture device (optional, for video capture)
- ETC Eos lighting console (optional, for Eos integration)
- Elgato Stream Deck Companion (optional, for automation)

## Installation

1. **Install FFmpeg**:
   ```bash
   brew install ffmpeg
   ```

2. **Install Nostalgia Box Controller**:
   - Download the DMG from the releases page
   - Open `Nostalgia Box Controller-1.1.0-arm64.dmg`
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

## Usage Tips

### Naming Conventions

The naming preview shows how your files will be named with current data. Experiment with different templates to find what works best for your workflow.

**Good folder naming examples**:
- `{eosCueListName}_{eosCueLabel}` - Organized by cue
- `{timestamp}_{eosShowName}` - Organized by date and show
- `Show_{eosCueNumber}` - Simple cue number organization

**Good file naming examples**:
- `{input}_{eosCueLabel}` - Input number with cue label
- `{timestamp}_{input}` - Timestamp with input number
- `{eosCueListName}_{input}_{eosCueNumber}` - Full cue info with input

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

Output: `dist/Nostalgia Box Controller-1.1.0-arm64.dmg`

## Technical Details

- **Framework**: Electron 30.x
- **OSC Protocol**: OSC over TCP (port 3032)
- **Video Capture**: FFmpeg with AVFoundation
- **Router Protocol**: Telnet (port 9990)
- **Architecture**: Secure IPC with main/renderer process separation

## License

Copyright 2024-2025. All rights reserved.

## Support

For issues, feature requests, or questions, please contact the development team.

---

**Version**: 1.1.0
**Last Updated**: 2025
