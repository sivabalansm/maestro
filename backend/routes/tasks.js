import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createTask, getTask, getTasksByUser, getLatestTask, updateTaskStatus, getScheduledTasks, updateTaskScheduledTime, cancelScheduledTask } from '../db.js';
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

// Get scheduled tasks for a user
router.get('/scheduled', async (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';
    const tasks = await getScheduledTasks(userId);
    res.json({ tasks });
  } catch (error) {
    console.error('[Tasks] Error getting scheduled tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update scheduled time for a task
router.put('/:id/schedule', async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    const taskId = req.params.id;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Missing required field: scheduledAt' });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt date format' });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const task = await updateTaskScheduledTime(taskId, scheduledDate.toISOString());
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ success: true, task });
  } catch (error) {
    console.error('[Tasks] Error updating scheduled time:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel/delete a scheduled task
router.delete('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Check if task exists
    const task = await getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only allow cancellation of pending scheduled tasks
    if (task.status !== 'pending' || !task.scheduled_at) {
      return res.status(400).json({ error: 'Can only cancel pending scheduled tasks' });
    }

    await cancelScheduledTask(taskId);
    res.json({ success: true, message: 'Task cancelled successfully' });
  } catch (error) {
    console.error('[Tasks] Error cancelling task:', error);
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

