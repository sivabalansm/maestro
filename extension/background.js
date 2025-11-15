// Background service worker for Maestro Extension
// Handles WebSocket connection and task orchestration

// WebSocket URL - change this to match your backend
const WS_URL = 'ws://localhost:3001';
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let extensionId = null;

// Initialize WebSocket connection
async function initWebSocket() {
  try {
    // Get or generate extension ID
    const stored = await chrome.storage.local.get(['extensionId']);
    if (stored.extensionId) {
      extensionId = stored.extensionId;
    } else {
      extensionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await chrome.storage.local.set({ extensionId });
    }

    ws = new WebSocket(`${WS_URL}/extension/ws?extensionId=${extensionId}`);

    ws.onopen = () => {
      console.log('[Maestro] WebSocket connected');
      reconnectAttempts = 0;
      // Register extension with backend
      sendToBackend({
        type: 'register',
        extensionId,
        timestamp: Date.now()
      });
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handleBackendMessage(message);
      } catch (error) {
        console.error('[Maestro] Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Maestro] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Maestro] WebSocket closed, attempting reconnect...');
      attemptReconnect();
    };
  } catch (error) {
    console.error('[Maestro] Failed to initialize WebSocket:', error);
    attemptReconnect();
  }
}

function attemptReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    setTimeout(() => {
      console.log(`[Maestro] Reconnecting (attempt ${reconnectAttempts})...`);
      initWebSocket();
    }, delay);
  } else {
    console.error('[Maestro] Max reconnection attempts reached');
  }
}

function sendToBackend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    console.warn('[Maestro] WebSocket not ready, queuing message');
    // Queue message for when connection is ready
    setTimeout(() => sendToBackend(data), 1000);
  }
}

async function handleBackendMessage(message) {
  const { type, task } = message;

  switch (type) {
    case 'task':
      if (task) {
        await executeTask(task);
      }
      break;
    case 'ping':
      sendToBackend({ type: 'pong', timestamp: Date.now() });
      break;
    default:
      console.log('[Maestro] Unknown message type:', type);
  }
}

async function executeTask(task) {
  const { id, type: taskType, params } = task;

  console.log(`[Maestro] Executing task ${id}: ${taskType}`);

  // Send task started status
  sendToBackend({
    type: 'task_status',
    taskId: id,
    status: 'started',
    timestamp: Date.now()
  });

  try {
    let result = null;

    switch (taskType) {
      case 'navigate':
        result = await handleNavigate(params);
        break;
      case 'click':
        result = await handleClick(params);
        break;
      case 'fill':
        result = await handleFill(params);
        break;
      case 'extract':
        result = await handleExtract(params);
        break;
      case 'wait':
        result = await handleWait(params);
        break;
      case 'custom':
        result = await handleCustom(params);
        break;
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }

    // Send task completed status
    sendToBackend({
      type: 'task_result',
      taskId: id,
      status: 'completed',
      result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error(`[Maestro] Task ${id} failed:`, error);
    sendToBackend({
      type: 'task_result',
      taskId: id,
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });
  }
}

async function handleNavigate(params) {
  const { url } = params;
  const tab = await chrome.tabs.create({ url, active: true });
  return { tabId: tab.id, url };
}

async function handleClick(params) {
  const { selector, tabId } = params;
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId, {
      type: 'execute',
      action: 'click',
      params: { selector }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

async function handleFill(params) {
  const { selector, value, tabId } = params;
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId, {
      type: 'execute',
      action: 'fill',
      params: { selector, value }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

async function handleExtract(params) {
  const { selector, attribute, tabId } = params;
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId, {
      type: 'execute',
      action: 'extract',
      params: { selector, attribute }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

async function handleWait(params) {
  const { duration } = params;
  return new Promise((resolve) => {
    setTimeout(() => resolve({ waited: duration }), duration || 1000);
  });
}

async function handleCustom(params) {
  const { script, tabId } = params;
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId, {
      type: 'execute',
      action: 'custom',
      params: { script }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'task_result') {
    sendToBackend({
      type: 'task_result',
      taskId: message.taskId,
      status: message.status,
      result: message.result,
      error: message.error,
      timestamp: Date.now()
    });
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

// Initialize on extension install/start
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maestro] Extension installed');
  initWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Maestro] Extension started');
  initWebSocket();
});

// Initialize WebSocket on service worker startup
initWebSocket();

