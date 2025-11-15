# Maestro

Autonomous Agentic AI browser extension to automate repetitive tasks on a schedule.

## Project Structure

```
maestro/
├── extension/          # Browser extension (Chrome/Firefox)
├── backend/            # Node.js backend server
└── frontend/           # React frontend (Vite + shadcn/ui)
```

## Features

- **Browser Extension**: Executes tasks in the browser via WebSocket
- **Backend Server**: Manages tasks, WebSocket connections, and task history
- **React Frontend**: GPT-style chat interface, dashboard with Gantt chart, account management
- **Task Types**: Navigate, Click, Fill, Extract, Wait, Custom

## Setup

### Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on `http://localhost:3001`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### Extension

1. Open Chrome/Edge and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory
5. The extension will connect to `ws://localhost:3001/extension/ws`

## Development

### Example Task Flow

1. Open the frontend at `http://localhost:3000`
2. Type a prompt like "Open google.com and search for AI"
3. The task is created and sent to the extension
4. The extension executes the task in the browser
5. Results appear in the Dashboard

### Task JSON Format

```json
{
  "id": "task-uuid",
  "type": "navigate" | "click" | "fill" | "extract" | "wait" | "custom",
  "params": {
    "url": "https://example.com",
    "selector": "#button",
    "value": "text to fill",
    "duration": 1000
  }
}
```

## API Endpoints

- `POST /api/tasks/create` - Create a new task
- `GET /api/tasks/queue` - Get task queue
- `GET /api/tasks/latest` - Get latest completed task
- `GET /api/extension/connections` - Get connected extensions
- `POST /api/extension/register` - Register extension

## WebSocket

Extension connects to: `ws://localhost:3001/extension/ws?extensionId=<id>`

Messages:
- `{ type: 'task', task: {...} }` - Task to execute
- `{ type: 'task_result', taskId, status, result }` - Task result

## Notes

- OAuth2 integration is skeleton (not fully implemented)
- Extension icons need to be added to `extension/icons/`
- Database uses SQLite (stored in `backend/maestro.db`)
