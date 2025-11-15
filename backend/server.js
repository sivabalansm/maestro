import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './db.js';
import taskRoutes from './routes/tasks.js';
import extensionRoutes from './routes/extension.js';
import authRoutes from './routes/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/extension/ws' });

const PORT = process.env.PORT || 3001;
const WS_PORT = PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Store active WebSocket connections by extensionId
const extensionConnections = new Map();

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const extensionId = url.searchParams.get('extensionId');

  if (!extensionId) {
    ws.close(1008, 'Missing extensionId');
    return;
  }

  console.log(`[WS] Extension connected: ${extensionId}`);
  extensionConnections.set(extensionId, ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleExtensionMessage(extensionId, message);
    } catch (error) {
      console.error('[WS] Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Extension disconnected: ${extensionId}`);
    extensionConnections.delete(extensionId);
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error for ${extensionId}:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    extensionId,
    timestamp: Date.now()
  }));
});

async function handleExtensionMessage(extensionId, message) {
  const { type, taskId, status, result, error } = message;

  switch (type) {
    case 'register':
      console.log(`[WS] Extension registered: ${extensionId}`);
      // Store extension registration in database
      break;

    case 'task_status':
      console.log(`[WS] Task ${taskId} status: ${status}`);
      // Update task status in database
      // Emit to frontend via SSE or WebSocket if needed
      break;

    case 'task_result':
      console.log(`[WS] Task ${taskId} result: ${status}`);
      // Store task result in database
      // Emit to frontend
      break;

    case 'pong':
      // Heartbeat response
      break;

    default:
      console.log(`[WS] Unknown message type: ${type}`);
  }
}

// Function to send task to extension
export function sendTaskToExtension(extensionId, task) {
  const ws = extensionConnections.get(extensionId);
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify({
      type: 'task',
      task
    }));
    return true;
  }
  return false;
}

// Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', connections: extensionConnections.size });
});

// Initialize database
await initDatabase();

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Backend running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket server on ws://localhost:${WS_PORT}/extension/ws`);
});

export { sendTaskToExtension, extensionConnections };

