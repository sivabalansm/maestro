# Maestro Browser Extension

Chrome/Firefox extension that executes browser automation tasks.

## Files

- `manifest.json` - Extension manifest (Chrome Manifest V3)
- `background.js` - Service worker for WebSocket connection and task orchestration
- `content.js` - Content script that executes DOM operations
- `popup/` - Extension popup UI

## Task Execution

The extension receives tasks via WebSocket and executes them:

- **navigate**: Opens a URL in a new tab
- **click**: Clicks an element by selector
- **fill**: Fills an input field
- **extract**: Extracts data from elements
- **wait**: Waits for a duration
- **custom**: Executes custom JavaScript

## Setup

1. Load the extension in Chrome/Edge:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select this directory

2. The extension will automatically connect to `ws://localhost:3001/extension/ws`

## Icons

Add these icon files to the `icons/` directory:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can use a placeholder or generate icons using an icon generator.

