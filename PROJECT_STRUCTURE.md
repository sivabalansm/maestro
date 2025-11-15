# Maestro Project Structure

## Overview

Maestro is a full-stack browser automation system with three main components:

1. **Browser Extension** - Executes tasks in the browser
2. **Backend Server** - Manages tasks, WebSocket connections, and data
3. **React Frontend** - User interface for creating and monitoring tasks

## Directory Structure

```
maestro/
├── extension/              # Browser extension (Chrome/Firefox)
│   ├── manifest.json       # Extension manifest (Manifest V3)
│   ├── background.js       # Service worker (WebSocket, task orchestration)
│   ├── content.js          # Content script (DOM operations)
│   ├── popup/              # Extension popup UI
│   │   ├── popup.html
│   │   └── popup.js
│   ├── icons/              # Extension icons (add icon files here)
│   └── README.md
│
├── backend/                # Node.js backend server
│   ├── server.js           # Express server + WebSocket
│   ├── db.js               # SQLite database operations
│   ├── routes/             # API routes
│   │   ├── tasks.js       # Task CRUD operations
│   │   ├── extension.js   # Extension registration
│   │   └── auth.js        # OAuth skeleton
│   ├── package.json
│   ├── example-task.js     # Example: create test task
│   └── maestro.db          # SQLite database (auto-created)
│
├── frontend/               # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx         # Main app component
│   │   ├── main.jsx        # Entry point
│   │   ├── index.css       # Global styles
│   │   ├── pages/          # Page components
│   │   │   ├── Home.jsx    # GPT-style chat interface
│   │   │   ├── Dashboard.jsx # Task dashboard with Gantt
│   │   │   └── Account.jsx  # User account page
│   │   ├── components/     # React components
│   │   │   ├── Layout.jsx  # Sidebar layout
│   │   │   ├── GanttChart.jsx # Task timeline
│   │   │   ├── theme-provider.jsx # Dark/light mode
│   │   │   └── ui/         # shadcn/ui components
│   │   └── lib/
│   │       └── utils.js    # Utility functions
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── README.md               # Main project documentation
├── SETUP.md               # Setup instructions
├── PROJECT_STRUCTURE.md   # This file
└── dev.sh                 # Development helper script
```

## Component Details

### Extension (`extension/`)

- **Manifest V3** compliant
- **Background script** maintains WebSocket connection to backend
- **Content script** executes DOM operations (click, fill, extract)
- **Message passing** between background ↔ content script
- **Task types**: navigate, click, fill, extract, wait, custom

### Backend (`backend/`)

- **Express.js** REST API
- **WebSocket** server for real-time extension communication
- **SQLite** database for tasks, users, logs
- **API Routes**:
  - `POST /api/tasks/create` - Create task
  - `GET /api/tasks/queue` - Get task queue
  - `GET /api/tasks/latest` - Get latest task
  - `GET /api/extension/connections` - List extensions
- **WebSocket**: `ws://localhost:3001/extension/ws`

### Frontend (`frontend/`)

- **Vite + React** for fast development
- **shadcn/ui** components (Tailwind-based)
- **React Router** for navigation
- **Recharts** for Gantt chart visualization
- **Three pages**:
  - **Home**: GPT-style chat to create tasks
  - **Dashboard**: Task timeline, latest task, history
  - **Account**: User info, stats, subscription

## Data Flow

1. **User creates task** (Frontend → Backend API)
2. **Backend stores task** (Database)
3. **Backend sends task** (WebSocket → Extension)
4. **Extension executes** (Background → Content Script)
5. **Extension reports result** (WebSocket → Backend)
6. **Backend updates task** (Database)
7. **Frontend polls/updates** (Dashboard refresh)

## Task Schema

```json
{
  "id": "uuid",
  "type": "navigate" | "click" | "fill" | "extract" | "wait" | "custom",
  "params": {
    "url": "https://example.com",
    "selector": "#button",
    "value": "text",
    "duration": 1000
  },
  "status": "pending" | "started" | "completed" | "failed",
  "userId": "user-id",
  "extensionId": "ext-id",
  "scheduledAt": "2024-01-01T00:00:00Z"
}
```

## Technology Stack

- **Extension**: Vanilla JavaScript (Manifest V3)
- **Backend**: Node.js, Express, WebSocket (ws), SQLite
- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, Recharts
- **Database**: SQLite3

## Development

See `SETUP.md` for detailed setup instructions.

Quick start:
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev

# Load extension in Chrome
# chrome://extensions/ → Load unpacked → select extension/
```

