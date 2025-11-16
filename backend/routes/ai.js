import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateTask } from '../services/gemini.js';
import { createAISession, getAISession, updateAISession, addToConversationHistory } from '../db.js';
import { createTask } from '../db.js';
import { sendTaskToExtension, extensionConnections } from '../server.js';

const router = express.Router();

// Store pending page HTML requests: Map<extensionId, { resolve, reject, timeout }>
const pendingPageHtmlRequests = new Map();

// Start AI-powered task sequence
router.post('/start', async (req, res) => {
  try {
    const { prompt, extensionId, userId } = req.body;

    if (!prompt || !extensionId) {
      return res.status(400).json({ error: 'Missing required fields: prompt, extensionId' });
    }

    // Create AI session
    const sessionId = uuidv4();
    await createAISession({
      id: sessionId,
      userId: userId || 'anonymous',
      extensionId,
      originalPrompt: prompt
    });

    // Request page info from extension
    const pageInfo = await requestPageHtmlFromExtension(extensionId);
    if (!pageInfo) {
      return res.status(500).json({ error: 'Failed to get page info from extension' });
    }

    // Generate first task using Gemini
    const taskData = await generateTask(prompt, pageInfo, []);

    // Create task
    const task = {
      id: uuidv4(),
      userId: userId || 'anonymous',
      extensionId,
      type: taskData.type,
      params: taskData.params,
      reasoning: taskData.reasoning,
      scheduledAt: null
    };

    await createTask(task);

    // Add to conversation history
    await addToConversationHistory(sessionId, {
      task: { type: task.type, params: task.params },
      reasoning: taskData.reasoning,
      pageInfo: {
        url: pageInfo.url,
        title: pageInfo.title,
        elementCount: pageInfo.interactiveElements?.length || 0
      }
    });

    // Send task to extension
    const sent = sendTaskToExtension(extensionId, task);
    if (!sent) {
      return res.status(500).json({ error: 'Extension not connected' });
    }

    // Store session info for continuation
    const { activeAISessions } = await import('../server.js');
    activeAISessions.set(sessionId, {
      extensionId,
      taskId: task.id
    });

    res.json({
      success: true,
      sessionId,
      task,
      reasoning: taskData.reasoning,
      isComplete: taskData.isComplete
    });
  } catch (error) {
    console.error('[AI] Error starting AI task sequence:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shared function to continue task sequence (can be called directly or via HTTP)
export async function continueTaskSequence(sessionId, pageData, lastTaskResult) {
  // Support both new format (pageInfo) and old format (pageHtml) for backward compatibility
  const pageInfo = pageData.interactiveElements ? pageData : (pageData.html ? { html: pageData.html } : null);

  if (!sessionId || !pageInfo) {
    throw new Error('Missing required fields: sessionId, pageInfo');
  }

  // Get session
  const session = await getAISession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'active') {
    throw new Error('Session is not active');
  }

  // Add last task result to conversation history with reasoning
  await addToConversationHistory(sessionId, {
    task: lastTaskResult?.task ? {
      type: lastTaskResult.task.type,
      params: lastTaskResult.task.params
    } : null,
    reasoning: lastTaskResult?.reasoning || lastTaskResult?.task?.reasoning || null, // Include reasoning
    result: lastTaskResult?.result,
    error: lastTaskResult?.error,
    pageInfo: pageInfo.interactiveElements ? {
      url: pageInfo.url,
      title: pageInfo.title,
      elementCount: pageInfo.interactiveElements?.length || 0
    } : { html: 'truncated' }
  });

  // Get updated conversation history (includes the just-completed task)
  const updatedSession = await getAISession(sessionId);
  const conversationHistory = updatedSession.conversation_history || [];

  // Generate next task - include all history so AI knows what was done
  const taskData = await generateTask(
    session.original_prompt,
    pageInfo,
    conversationHistory // Include all history including the just-completed task
  );

  if (taskData.isComplete) {
    // Mark session as complete
    await updateAISession(sessionId, { status: 'completed' });
    return {
      success: true,
      isComplete: true,
      message: 'Task sequence completed'
    };
  }

  // Create next task
  const task = {
    id: uuidv4(),
    userId: session.user_id,
    extensionId: session.extension_id,
    type: taskData.type,
    params: taskData.params,
    reasoning: taskData.reasoning,
    scheduledAt: null
  };

  await createTask(task);

  // Add to conversation history
  await addToConversationHistory(sessionId, {
    task: { type: task.type, params: task.params },
    reasoning: taskData.reasoning,
    pageInfo: pageInfo.interactiveElements ? {
      url: pageInfo.url,
      title: pageInfo.title,
      elementCount: pageInfo.interactiveElements?.length || 0
    } : { html: 'truncated' }
  });

  // Send task to extension
  const sent = sendTaskToExtension(session.extension_id, task);
  if (!sent) {
    throw new Error('Extension not connected');
  }

  // Update active session tracking
  const { activeAISessions } = await import('../server.js');
  activeAISessions.set(sessionId, {
    extensionId: session.extension_id,
    taskId: task.id
  });

  return {
    success: true,
    task,
    reasoning: taskData.reasoning,
    isComplete: false
  };
}

// Continue task sequence after execution (HTTP endpoint)
router.post('/continue', async (req, res) => {
  try {
    const { sessionId, pageInfo, pageHtml, lastTaskResult } = req.body;

    // Support both new format (pageInfo) and old format (pageHtml) for backward compatibility
    const pageData = pageInfo || (pageHtml ? { html: pageHtml } : null);

    const result = await continueTaskSequence(sessionId, pageData, lastTaskResult);
    res.json(result);
  } catch (error) {
    console.error('[AI] Error continuing AI task sequence:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session status and latest tasks
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getAISession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get the latest task from conversation history
    const history = session.conversation_history || [];
    const latestTaskEntry = history.filter(entry => entry.task).pop();
    
    res.json({
      sessionId: session.id,
      status: session.status,
      originalPrompt: session.original_prompt,
      conversationHistory: history,
      latestTask: latestTaskEntry?.task || null,
      isComplete: session.status === 'completed'
    });
  } catch (error) {
    console.error('[AI] Error getting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to request page info from extension
function requestPageHtmlFromExtension(extensionId) {
  return new Promise((resolve, reject) => {
    const ws = extensionConnections.get(extensionId);
    if (!ws || ws.readyState !== 1) {
      reject(new Error('Extension not connected'));
      return;
    }

    const requestId = uuidv4();
    const timeout = setTimeout(() => {
      pendingPageHtmlRequests.delete(requestId);
      reject(new Error('Timeout waiting for page info'));
    }, 10000); // 10 second timeout

    pendingPageHtmlRequests.set(requestId, { resolve, reject, timeout });

    // Send request to extension
    ws.send(JSON.stringify({
      type: 'request_page_html',
      requestId
    }));
  });
}

// Export function to handle page info responses
export function handlePageHtmlResponse(requestId, pageData) {
  const request = pendingPageHtmlRequests.get(requestId);
  if (request) {
    clearTimeout(request.timeout);
    pendingPageHtmlRequests.delete(requestId);
    request.resolve(pageData);
  }
}

export default router;

