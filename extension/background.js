// Background service worker for Maestro Extension
// Handles WebSocket connection and task orchestration

// WebSocket URL - change this to match your backend
const WS_URL = 'ws://localhost:3001';
let ws = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let extensionId = null;
let pingInterval = null;
let lastPongTime = null;
let isConnecting = false;
let connectionTimeout = null;
const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 60000; // 60 seconds - if no pong received, reconnect
const CONNECTION_TIMEOUT = 10000; // 10 seconds - timeout for connection attempt
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds between attempts

// Initialize WebSocket connection
async function initWebSocket() {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('[Maestro] Connection attempt already in progress, skipping...');
    return;
  }

  // Clear any pending reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Close existing connection if any
  if (ws) {
    try {
      // Remove event listeners to prevent triggering reconnect from old connection
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch (e) {
      // Ignore errors when closing
    }
    ws = null;
  }

  try {
    isConnecting = true;

    // Get or generate extension ID
    const stored = await chrome.storage.local.get(['extensionId']);
    if (stored.extensionId) {
      extensionId = stored.extensionId;
    } else {
      extensionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await chrome.storage.local.set({ extensionId });
    }

    console.log(`[Maestro] Attempting to connect to ${WS_URL}...`);
    ws = new WebSocket(`${WS_URL}/extension/ws?extensionId=${extensionId}`);

    // Connection timeout - if connection doesn't open within CONNECTION_TIMEOUT, consider it failed
    connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.warn('[Maestro] Connection timeout - server may be down');
        try {
          ws.close();
        } catch (e) {
          // Ignore errors
        }
        isConnecting = false;
        attemptReconnect();
      }
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('[Maestro] WebSocket connected successfully');
      isConnecting = false;
      reconnectAttempts = 0; // Reset on successful connection
      lastPongTime = Date.now();
      
      // Register extension with backend
      sendToBackend({
        type: 'register',
        extensionId,
        timestamp: Date.now()
      });

      // Start periodic ping to keep connection alive
      startPingInterval();
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
      clearTimeout(connectionTimeout);
      console.error('[Maestro] WebSocket error:', error);
      isConnecting = false;
      // Don't reconnect here - let onclose handle it
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log(`[Maestro] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
      isConnecting = false;
      stopPingInterval();
      
      // Only reconnect if not a normal closure (code 1000)
      // Normal closure means intentional disconnect, don't reconnect
      if (event.code !== 1000) {
        attemptReconnect();
      } else {
        console.log('[Maestro] Normal closure, not reconnecting');
      }
    };
  } catch (error) {
    clearTimeout(connectionTimeout);
    console.error('[Maestro] Failed to initialize WebSocket:', error);
    isConnecting = false;
    attemptReconnect();
  }
}

function attemptReconnect() {
  // Clear any existing reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Don't reconnect if already connecting
  if (isConnecting) {
    return;
  }

  reconnectAttempts++;
  
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s, 30s...
  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY
  );

  console.log(`[Maestro] Scheduling reconnect attempt ${reconnectAttempts} in ${delay}ms...`);
  
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    console.log(`[Maestro] Reconnecting (attempt ${reconnectAttempts})...`);
    initWebSocket();
  }, delay);
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

// Start periodic ping to keep connection alive
function startPingInterval() {
  stopPingInterval(); // Clear any existing interval
  
  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Check if we haven't received a pong in too long
      if (lastPongTime && (Date.now() - lastPongTime) > PONG_TIMEOUT) {
        console.warn('[Maestro] No pong received, reconnecting...');
        ws.close();
        return;
      }
      
      // Send ping
      sendToBackend({
        type: 'ping',
        timestamp: Date.now()
      });
    } else {
      stopPingInterval();
    }
  }, PING_INTERVAL);
}

// Stop ping interval
function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

async function handleBackendMessage(message) {
  const { type, task, requestId } = message;

  switch (type) {
    case 'task':
      if (task) {
        await executeTask(task);
      }
      break;
    case 'request_page_html':
      // Extract structured page information and send back
      const pageInfo = await extractPageHtml();
      sendToBackend({
        type: 'page_html',
        requestId,
        pageInfo: pageInfo
      });
      break;
    case 'ping':
      // Update last pong time and respond
      lastPongTime = Date.now();
      sendToBackend({ type: 'pong', timestamp: Date.now() });
      break;
    case 'connected':
      // Update last pong time on connection confirmation
      lastPongTime = Date.now();
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

    // Wait a bit for page to update after task (especially for clicks that trigger navigation)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract structured page information after task completion
    let pageInfo = null;
    try {
      // Retry logic for page info extraction
      let retries = 3;
      while (retries > 0) {
        try {
          pageInfo = await extractPageHtml();
          break;
        } catch (htmlError) {
          retries--;
          if (retries > 0) {
            console.log(`[Maestro] Retrying page info extraction (${retries} retries left)...`);
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            console.warn(`[Maestro] Failed to extract page info after retries:`, htmlError);
          }
        }
      }
    } catch (htmlError) {
      console.warn(`[Maestro] Failed to extract page info:`, htmlError);
    }

    // Send task completed status with structured page info
    sendToBackend({
      type: 'task_result',
      taskId: id,
      status: 'completed',
      result,
      pageInfo,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error(`[Maestro] Task ${id} failed:`, error);
    
    // Try to extract page info even on error
    let pageInfo = null;
    try {
      // Wait a bit before extracting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      pageInfo = await extractPageHtml();
    } catch (htmlError) {
      console.warn(`[Maestro] Failed to extract page info:`, htmlError);
    }

    sendToBackend({
      type: 'task_result',
      taskId: id,
      status: 'failed',
      error: error.message,
      pageInfo,
      timestamp: Date.now()
    });
  }
}

async function handleNavigate(params) {
  const { url } = params;
  const tab = await chrome.tabs.create({ url, active: true });
  
  // Wait for page to load completely
  await new Promise((resolve) => {
    const checkComplete = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(checkComplete);
        // Additional wait for dynamic content
        setTimeout(resolve, 1000);
      }
    };
    chrome.tabs.onUpdated.addListener(checkComplete);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(checkComplete);
      resolve();
    }, 10000);
  });
  
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

// Extract page HTML from active tab
async function extractPageHtml(tabId = null) {
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  // Ensure content script is loaded - try to inject if needed
  try {
    // Check if we can access the page
    await chrome.tabs.sendMessage(targetTabId, { type: 'ping' }, () => {
      // If this fails, content script might not be loaded
    });
  } catch (error) {
    // Content script might not be loaded, try to inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ['content.js']
      });
      // Wait for script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (injectError) {
      console.warn('[Maestro] Could not inject content script:', injectError);
      // Continue anyway - might work if content script loads naturally
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for page HTML extraction'));
    }, 10000); // 10 second timeout

    chrome.tabs.sendMessage(targetTabId, {
      type: 'execute',
      action: 'extractPageHtml',
      params: {}
    }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else if (response?.success && response.result) {
        resolve(response.result);
      } else {
        reject(new Error('Failed to extract page HTML'));
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

// Keep service worker alive during active operations
let keepAliveInterval = null;

function keepServiceWorkerAlive() {
  // Chrome service workers can be put to sleep after 30 seconds of inactivity
  // We'll keep it alive by periodically checking storage
  keepAliveInterval = setInterval(async () => {
    try {
      // Simple operation to keep service worker active
      await chrome.storage.local.get(['extensionId']);
    } catch (error) {
      // Ignore errors
    }
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Periodic connection health check
let connectionCheckInterval = null;

function startConnectionCheck() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  
  connectionCheckInterval = setInterval(() => {
    // Check if connection is alive
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!isConnecting) {
        console.log('[Maestro] Connection check: WebSocket not connected, attempting reconnect...');
        attemptReconnect();
      }
    }
  }, 60000); // Check every 60 seconds
}

function stopConnectionCheck() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
}

// Initialize on extension install/start
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maestro] Extension installed');
  keepServiceWorkerAlive();
  startConnectionCheck();
  // Small delay to ensure storage is ready
  setTimeout(() => initWebSocket(), 100);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Maestro] Extension started');
  keepServiceWorkerAlive();
  startConnectionCheck();
  setTimeout(() => initWebSocket(), 100);
});

// Listen for service worker wake-up (Chrome may wake it periodically)
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Maestro] Service worker woken up');
  // Check connection status and reconnect if needed
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (!isConnecting) {
      console.log('[Maestro] Connection lost, reconnecting...');
      attemptReconnect();
    }
  }
});

// Initialize WebSocket on service worker startup
keepServiceWorkerAlive();
startConnectionCheck();
setTimeout(() => initWebSocket(), 100);

