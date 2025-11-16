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
import aiRoutes, { handlePageHtmlResponse } from './routes/ai.js';

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
// Increase body parser limit to handle large page data (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Store active WebSocket connections by extensionId
const extensionConnections = new Map();

// Store active AI sessions: Map<sessionId, { extensionId, taskId }>
const activeAISessions = new Map();

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

  // Set up ping interval for this connection
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error(`[WS] Error sending ping to ${extensionId}:`, error);
        clearInterval(pingInterval);
      }
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // Ping every 30 seconds

  // Store ping interval with connection for cleanup
  ws._pingInterval = pingInterval;

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
    if (ws._pingInterval) {
      clearInterval(ws._pingInterval);
    }
    extensionConnections.delete(extensionId);
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error for ${extensionId}:`, error);
    if (ws._pingInterval) {
      clearInterval(ws._pingInterval);
    }
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    extensionId,
    timestamp: Date.now()
  }));
});

async function handleExtensionMessage(extensionId, message) {
  const { type, taskId, status, result, error, requestId, html, pageHtml, pageInfo } = message;

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
      
      // Check if this task is part of an AI session
      const sessionEntry = Array.from(activeAISessions.entries()).find(
        ([_, session]) => session.taskId === taskId
      );

      // Use pageInfo if available, fallback to pageHtml for backward compatibility
      const pageData = pageInfo || (pageHtml ? { html: pageHtml } : null);
      
      if (sessionEntry && pageData) {
        const [sessionId, sessionData] = sessionEntry;
        // Continue AI task sequence
        await continueAITaskSequence(sessionId, taskId, result, pageData, error);
      }
      break;

    case 'page_html':
      // Handle page info response from extension
      if (requestId && (pageInfo || html)) {
        handlePageHtmlResponse(requestId, pageInfo || html);
      }
      break;
    // Heartbeat response - connection is alive
    case 'ping':
      // console.log(`[WS] Ping received from ${extensionId}`);
      break;

    case 'pong':
      // console.log(`[WS] Pong received from ${extensionId}`);
      break;

    default:
      console.log(`[WS] Unknown message type: ${type}`);
  }
}

// Helper function to continue AI task sequence
async function continueAITaskSequence(sessionId, completedTaskId, taskResult, pageData, taskError) {
  try {
    const { getAISession, getTask, updateTaskStatus } = await import('./db.js');
    const session = await getAISession(sessionId);
    if (!session || session.status !== 'active') {
      console.log(`[AI] Session ${sessionId} is not active, skipping continuation`);
      return;
    }

    const completedTask = await getTask(completedTaskId);
    
    // Update task status in database
    if (completedTask) {
      await updateTaskStatus(completedTaskId, taskError ? 'failed' : 'completed', taskResult, taskError);
    }
    
    if (!pageData) {
      console.warn(`[AI] No page data provided for session ${sessionId}, cannot continue`);
      return;
    }

    const dataSize = pageData.interactiveElements ? 
      JSON.stringify(pageData).length : 
      (pageData.html ? pageData.html.length : 0);
    console.log(`[AI] Continuing task sequence for session ${sessionId} with page data (${dataSize} chars)`);
    
    // Call continue task sequence function directly (avoid HTTP overhead and body size limits)
    const { continueTaskSequence } = await import('./routes/ai.js');
    const result = await continueTaskSequence(sessionId, pageData, {
      task: completedTask,
      result: taskResult,
      error: taskError,
      reasoning: completedTask?.reasoning || null // Include reasoning from the task
    });

    if (result.isComplete) {
      activeAISessions.delete(sessionId);
      console.log(`[AI] Session ${sessionId} completed: ${result.message || 'Task sequence finished'}`);
    } else if (result.task) {
      // Update active session with new task
      activeAISessions.set(sessionId, {
        extensionId: session.extension_id,
        taskId: result.task.id
      });
      console.log(`[AI] Generated next task for session ${sessionId}: ${result.task.type}`);
      console.log(`[AI] Reasoning: ${result.reasoning}`);
    }
  } catch (error) {
    console.error(`[AI] Error continuing task sequence for session ${sessionId}:`, error);
    // Don't delete session on error - allow retry
  }
}

// Function to send task to extension
function sendTaskToExtension(extensionId, task) {
  const ws = extensionConnections.get(extensionId);
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    try {
      ws.send(JSON.stringify({
        type: 'task',
        task
      }));
      return true;
    } catch (error) {
      console.error(`[WS] Error sending task to ${extensionId}:`, error);
      extensionConnections.delete(extensionId);
      return false;
    }
  } else {
    console.warn(`[WS] Extension ${extensionId} not connected (readyState: ${ws?.readyState})`);
    return false;
  }
}

// Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

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

export { sendTaskToExtension, extensionConnections, activeAISessions };

