import { getDueScheduledTasks, getScheduledAISessions, getAISessionByTaskId, updateTaskStatus } from '../db.js';
import { sendTaskToExtension, extensionConnections } from '../server.js';
import { continueTaskSequence, requestPageHtmlFromExtension } from '../routes/ai.js';

let schedulerInterval = null;
const SCHEDULER_INTERVAL = 30000; // Check every 30 seconds

/**
 * Execute a scheduled task
 */
async function executeScheduledTask(task) {
  try {
    console.log(`[Scheduler] Executing scheduled task ${task.id} (${task.type})`);
    console.log(`[Scheduler] Task params:`, JSON.stringify(task.params));
    console.log(`[Scheduler] Task extension_id: ${task.extension_id}`);
    
    // Check if this is part of an AI session
    const aiSession = await getAISessionByTaskId(task.id);
    console.log(`[Scheduler] AI session found: ${aiSession ? aiSession.id : 'none'}`);
    
    // Update task status to started AFTER we know what type of task it is
    await updateTaskStatus(task.id, 'started');
    
    if (aiSession) {
      // This is an AI task - resume the AI sequence
      console.log(`[Scheduler] Resuming AI session ${aiSession.id} for task ${task.id}`);
      
      // Get the extension connection
      const extensionId = aiSession.extension_id;
      const ws = extensionConnections.get(extensionId);
      
      if (!ws || ws.readyState !== 1) {
        console.error(`[Scheduler] Extension ${extensionId} not connected for scheduled task ${task.id}`);
        await updateTaskStatus(task.id, 'failed', null, 'Extension not connected');
        return;
      }

      // Request current page info from extension
      let pageInfo;
      try {
        pageInfo = await requestPageHtmlFromExtension(extensionId);
      } catch (error) {
        console.error(`[Scheduler] Failed to get page info:`, error);
        await updateTaskStatus(task.id, 'failed', null, `Failed to get page info: ${error.message}`);
        return;
      }

      if (!pageInfo) {
        console.error(`[Scheduler] No page info received for task ${task.id}`);
        await updateTaskStatus(task.id, 'failed', null, 'No page info received');
        return;
      }

      // Continue the AI task sequence
      try {
        const result = await continueTaskSequence(aiSession.id, pageInfo, {
          task: { type: task.type, params: task.params },
          reasoning: task.reasoning || null,
          result: null,
          error: null
        });

        if (result.isComplete) {
          console.log(`[Scheduler] AI session ${aiSession.id} completed`);
        }
      } catch (error) {
        console.error(`[Scheduler] Error continuing AI sequence:`, error);
        await updateTaskStatus(task.id, 'failed', null, error.message);
      }
    } else {
      // This is a standalone task - send it directly to extension
      const extensionId = task.extension_id;
      console.log(`[Scheduler] Sending standalone task ${task.id} to extension ${extensionId}`);
      
      if (!extensionId) {
        console.error(`[Scheduler] Task ${task.id} has no extension_id`);
        await updateTaskStatus(task.id, 'failed', null, 'No extension_id specified');
        return;
      }
      
      const ws = extensionConnections.get(extensionId);
      if (!ws || ws.readyState !== 1) {
        console.error(`[Scheduler] Extension ${extensionId} not connected for task ${task.id}`);
        console.log(`[Scheduler] Available extensions: ${Array.from(extensionConnections.keys()).join(', ') || 'none'}`);
        await updateTaskStatus(task.id, 'failed', null, 'Extension not connected');
        return;
      }
      
      const sent = sendTaskToExtension(extensionId, task);
      
      if (!sent) {
        console.error(`[Scheduler] Failed to send task ${task.id} to extension ${extensionId}`);
        await updateTaskStatus(task.id, 'failed', null, 'Failed to send task to extension');
      } else {
        console.log(`[Scheduler] Successfully sent task ${task.id} to extension ${extensionId}`);
      }
    }
  } catch (error) {
    console.error(`[Scheduler] Error executing scheduled task ${task.id}:`, error);
    await updateTaskStatus(task.id, 'failed', null, error.message);
  }
}


/**
 * Check for and execute due scheduled tasks
 */
async function checkAndExecuteScheduledTasks() {
  try {
    // Get all due scheduled tasks
    const dueTasks = await getDueScheduledTasks();
    
    if (dueTasks.length > 0) {
      console.log(`[Scheduler] Found ${dueTasks.length} due scheduled task(s)`);
      console.log(`[Scheduler] Task IDs: ${dueTasks.map(t => `${t.id} (${t.status})`).join(', ')}`);
      
      // Before processing, verify task statuses in database
      const { getTask } = await import('../db.js');
      const verifiedTasks = [];
      
      for (const task of dueTasks) {
        // Re-fetch task from database to get current status
        const currentTask = await getTask(task.id);
        if (currentTask && currentTask.status === 'pending') {
          verifiedTasks.push(currentTask);
        } else {
          console.log(`[Scheduler] Task ${task.id} is no longer pending (current status: ${currentTask?.status || 'not found'}), skipping`);
        }
      }
      
      if (verifiedTasks.length > 0) {
        console.log(`[Scheduler] Processing ${verifiedTasks.length} verified pending task(s)`);
        
        // Execute each verified due task
        for (const task of verifiedTasks) {
          console.log(`[Scheduler] Processing task ${task.id} (type: ${task.type}, status: ${task.status})`);
          try {
            await executeScheduledTask(task);
            console.log(`[Scheduler] Finished processing task ${task.id}`);
          } catch (error) {
            console.error(`[Scheduler] Unexpected error processing task ${task.id}:`, error);
          }
        }
      } else {
        console.log(`[Scheduler] No tasks to process after verification (all tasks already processed)`);
      }
    } else {
      // Check for stuck tasks in 'started' status (but don't reset completed/failed tasks)
      const { getTasksByUser } = await import('../db.js');
      const allTasks = await getTasksByUser('anonymous', 100);
      const stuckTasks = allTasks.filter(t => 
        t.scheduled_at && 
        new Date(t.scheduled_at) <= new Date() && 
        t.status === 'started' &&
        (!t.started_at || new Date(t.started_at) < new Date(Date.now() - 5 * 60 * 1000)) // Started more than 5 minutes ago
      );
      
      if (stuckTasks.length > 0) {
        console.log(`[Scheduler] Found ${stuckTasks.length} stuck task(s) in 'started' status`);
        for (const task of stuckTasks) {
          console.log(`[Scheduler] Resetting stuck task ${task.id} to pending for retry`);
          await updateTaskStatus(task.id, 'pending');
        }
      }
    }

    // Also check for scheduled AI sessions that need to start
    const dueAISessions = await getScheduledAISessions();
    
    if (dueAISessions.length > 0) {
      console.log(`[Scheduler] Found ${dueAISessions.length} due scheduled AI session(s)`);
      
      for (const session of dueAISessions) {
        // Find the first task in this session
        const firstTaskEntry = session.conversation_history.find(entry => entry.task);
        
        if (firstTaskEntry && firstTaskEntry.task) {
          // Get the actual task from database
          const { getTask } = await import('../db.js');
          const task = await getTask(firstTaskEntry.task.id);
          
          if (task && task.status === 'pending') {
            await executeScheduledTask(task);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled tasks:', error);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  if (schedulerInterval) {
    console.log('[Scheduler] Scheduler already running');
    return;
  }

  console.log('[Scheduler] Starting task scheduler (checking every 30 seconds)');
  
  // Check immediately on startup
  checkAndExecuteScheduledTasks();
  
  // Then check every 30 seconds
  schedulerInterval = setInterval(() => {
    checkAndExecuteScheduledTasks();
  }, SCHEDULER_INTERVAL);
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Scheduler stopped');
  }
}

