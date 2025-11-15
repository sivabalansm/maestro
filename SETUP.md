# Maestro Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Chrome/Edge browser (for extension)
- Git

## Quick Start

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Start Backend Server

```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### 3. Install Frontend Dependencies

In a new terminal:

```bash
cd frontend
npm install
```

### 4. Start Frontend

```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

### 5. Load Browser Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension/` directory from this project
5. The extension icon should appear in your browser toolbar

### 6. Verify Connection

- Open the extension popup (click the extension icon)
- Check that it shows "Connected" status
- The backend console should show: `[WS] Extension connected: ext_...`

## Testing the System

### Example 1: Navigate Task

1. Open the frontend at `http://localhost:3000`
2. In the Home page, type: "Open google.com"
3. Click Send
4. A new tab should open with Google

### Example 2: Search Task

1. Type: "Open google.com and search for AI"
2. The extension will:
   - Navigate to Google
   - Fill the search box
   - Click search (if implemented)

### Example 3: Check Dashboard

1. Navigate to Dashboard page
2. You should see:
   - Task timeline (Gantt chart)
   - Last completed task
   - Task history list

## Development

### Backend API

- `POST /api/tasks/create` - Create task
- `GET /api/tasks/queue?userId=anonymous` - Get tasks
- `GET /api/tasks/latest?userId=anonymous` - Get latest task
- `GET /api/extension/connections` - List connected extensions

### WebSocket

Extension connects to: `ws://localhost:3001/extension/ws?extensionId=<id>`

### Database

SQLite database is created automatically at `backend/maestro.db`

Tables:
- `users` - User accounts
- `tasks` - Task records
- `task_logs` - Task execution logs
- `extensions` - Registered extensions

## Troubleshooting

### Extension Not Connecting

1. Check backend is running on port 3001
2. Check browser console for WebSocket errors
3. Verify extension has permissions in `manifest.json`
4. Try reloading the extension

### Tasks Not Executing

1. Check extension background script console
2. Verify WebSocket connection is active
3. Check task format matches expected schema
4. Look for errors in backend logs

### Frontend Not Loading

1. Verify Vite dev server is running
2. Check browser console for errors
3. Ensure API proxy is configured in `vite.config.js`

## Next Steps

- Add extension icons to `extension/icons/`
- Implement OAuth2 authentication
- Add more task types
- Integrate AI model for prompt-to-task conversion
- Add task scheduling UI
- Implement task retry logic

