import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createTask, getTask, getTasksByUser, getLatestTask, updateTaskStatus } from '../db.js';
import { sendTaskToExtension } from '../server.js';

const router = express.Router();

// Create a new task
router.post('/create', async (req, res) => {
  try {
    const { type, params, scheduledAt, extensionId, userId } = req.body;

    if (!type || !params) {
      return res.status(400).json({ error: 'Missing required fields: type, params' });
    }

    const task = {
      id: uuidv4(),
      userId: userId || 'anonymous', // In production, get from auth
      extensionId: extensionId || null,
      type,
      params,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null
    };

    await createTask(task);

    // If not scheduled, send immediately to extension
    if (!scheduledAt && extensionId) {
      const sent = sendTaskToExtension(extensionId, task);
      if (!sent) {
        console.warn(`[Tasks] Extension ${extensionId} not connected`);
      }
    }

    res.json({ success: true, task });
  } catch (error) {
    console.error('[Tasks] Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get task queue for a user
router.get('/queue', async (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';
    const tasks = await getTasksByUser(userId, 100);
    res.json({ tasks });
  } catch (error) {
    console.error('[Tasks] Error getting queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get latest completed task
router.get('/latest', async (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';
    const task = await getLatestTask(userId);
    res.json({ task });
  } catch (error) {
    console.error('[Tasks] Error getting latest task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific task
router.get('/:id', async (req, res) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ task });
  } catch (error) {
    console.error('[Tasks] Error getting task:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

