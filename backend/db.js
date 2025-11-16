import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'maestro.db');
let db = null;

export function getDb() {
  if (!db) {
    db = new sqlite3.Database(dbPath);
  }
  return db;
}

// Promisify database methods
function promisifyDb(db) {
  return {
    run: promisify(db.run.bind(db)),
    get: promisify(db.get.bind(db)),
    all: promisify(db.all.bind(db)),
    close: promisify(db.close.bind(db))
  };
}

export async function initDatabase() {
  const database = getDb();
  const db = promisifyDb(database);

  // Users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tasks table
  await db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      extension_id TEXT,
      type TEXT NOT NULL,
      params TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result TEXT,
      error TEXT,
      reasoning TEXT,
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Task history/logs table
  await db.run(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Extensions table
  await db.run(`
    CREATE TABLE IF NOT EXISTS extensions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // AI Sessions table
  await db.run(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      extension_id TEXT,
      original_prompt TEXT NOT NULL,
      conversation_history TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('[DB] Database initialized');
}

export async function createTask(task) {
  const database = getDb();
  const db = promisifyDb(database);

  const { id, userId, extensionId, type, params, scheduledAt, reasoning } = task;

  // Use UTC timestamp for created_at to match started_at and completed_at
  const createdAt = new Date().toISOString();

  await db.run(`
    INSERT INTO tasks (id, user_id, extension_id, type, params, scheduled_at, status, reasoning, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `, [id, userId, extensionId, type, JSON.stringify(params), scheduledAt || null, reasoning || null, createdAt]);

  return task;
}

export async function getTask(taskId) {
  const database = getDb();
  const db = promisifyDb(database);

  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (task) {
    task.params = JSON.parse(task.params);
    if (task.result) task.result = JSON.parse(task.result);
  }
  return task;
}

export async function updateTaskStatus(taskId, status, result = null, error = null) {
  const database = getDb();
  const db = promisifyDb(database);

  const updates = [];
  const values = [];

  if (status === 'started') {
    updates.push('started_at = ?');
    values.push(new Date().toISOString());
  } else if (status === 'completed' || status === 'failed') {
    updates.push('completed_at = ?');
    values.push(new Date().toISOString());
  }

  updates.push('status = ?');
  values.push(status);

  if (result) {
    updates.push('result = ?');
    values.push(JSON.stringify(result));
  }

  if (error) {
    updates.push('error = ?');
    values.push(error);
  }

  values.push(taskId);

  await db.run(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
}

export async function getTasksByUser(userId, limit = 100) {
  const database = getDb();
  const db = promisifyDb(database);

  const tasks = await db.all(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );

  return tasks.map(task => ({
    ...task,
    params: JSON.parse(task.params),
    result: task.result ? JSON.parse(task.result) : null
  }));
}

export async function getLatestTask(userId) {
  const database = getDb();
  const db = promisifyDb(database);

  const task = await db.get(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY completed_at DESC LIMIT 1',
    [userId]
  );

  if (task) {
    task.params = JSON.parse(task.params);
    if (task.result) task.result = JSON.parse(task.result);
  }

  return task;
}

export async function addTaskLog(taskId, level, message, data = null) {
  const database = getDb();
  const db = promisifyDb(database);

  await db.run(
    'INSERT INTO task_logs (task_id, level, message, data) VALUES (?, ?, ?, ?)',
    [taskId, level, message, data ? JSON.stringify(data) : null]
  );
}

export async function getUserStats(userId) {
  const database = getDb();
  const db = promisifyDb(database);

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const todayResult = await db.get(
    'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND DATE(completed_at) = ? AND status = ?',
    [userId, today, 'completed']
  );

  const weekResult = await db.get(
    'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND completed_at >= ? AND status = ?',
    [userId, weekAgo, 'completed']
  );

  const totalResult = await db.get(
    'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = ?',
    [userId, 'completed']
  );

  return {
    today: todayResult?.count || 0,
    week: weekResult?.count || 0,
    total: totalResult?.count || 0
  };
}

// Scheduled tasks functions
export async function getScheduledTasks(userId) {
  const database = getDb();
  const db = promisifyDb(database);

  const now = new Date().toISOString();
  
  const tasks = await db.all(
    `SELECT * FROM tasks 
     WHERE user_id = ? 
     AND scheduled_at IS NOT NULL 
     AND scheduled_at > ?
     AND status = 'pending'
     ORDER BY scheduled_at ASC`,
    [userId, now]
  );

  return tasks.map(task => ({
    ...task,
    params: JSON.parse(task.params),
    result: task.result ? JSON.parse(task.result) : null
  }));
}

export async function updateTaskScheduledTime(taskId, newScheduledAt) {
  const database = getDb();
  const db = promisifyDb(database);

  await db.run(
    'UPDATE tasks SET scheduled_at = ?, updated_at = ? WHERE id = ?',
    [newScheduledAt, new Date().toISOString(), taskId]
  );

  return getTask(taskId);
}

export async function cancelScheduledTask(taskId) {
  const database = getDb();
  const db = promisifyDb(database);

  // Delete the task
  await db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
  
  // Also check if there's an associated AI session and mark it as cancelled
  // We'll need to find the session by looking at tasks, but for now just delete the task
  return { success: true };
}

export async function getDueScheduledTasks() {
  const database = getDb();
  const db = promisifyDb(database);

  const now = new Date().toISOString();
  
  const tasks = await db.all(
    `SELECT * FROM tasks 
     WHERE scheduled_at IS NOT NULL 
     AND scheduled_at <= ?
     AND status = 'pending'
     ORDER BY scheduled_at ASC`,
    [now]
  );

  return tasks.map(task => ({
    ...task,
    params: JSON.parse(task.params),
    result: task.result ? JSON.parse(task.result) : null
  }));
}

// AI Session functions
export async function createAISession(session) {
  const database = getDb();
  const db = promisifyDb(database);

  const { id, userId, extensionId, originalPrompt, scheduledAt } = session;

  await db.run(`
    INSERT INTO ai_sessions (id, user_id, extension_id, original_prompt, conversation_history, status, scheduled_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `, [id, userId, extensionId, originalPrompt, JSON.stringify([]), scheduledAt || null]);

  return session;
}

export async function getAISession(sessionId) {
  const database = getDb();
  const db = promisifyDb(database);

  const session = await db.get('SELECT * FROM ai_sessions WHERE id = ?', [sessionId]);
  if (session) {
    session.conversation_history = JSON.parse(session.conversation_history || '[]');
  }
  return session;
}

export async function getAISessionByTaskId(taskId) {
  const database = getDb();
  const db = promisifyDb(database);

  // First, get the task to find its extension_id and user_id
  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) {
    return null;
  }

  // Find AI session with matching extension_id and user_id that is active
  const sessions = await db.all(
    'SELECT * FROM ai_sessions WHERE extension_id = ? AND user_id = ? AND status = ?',
    [task.extension_id, task.user_id, 'active']
  );
  
  // Check if any session has this task in conversation history (by task id)
  for (const session of sessions) {
    const history = JSON.parse(session.conversation_history || '[]');
    const hasTask = history.some(entry => entry.task && entry.task.id === taskId);
    
    if (hasTask) {
      session.conversation_history = history;
      return session;
    }
  }
  
  // If not found in history, check if session has matching scheduled_at
  for (const session of sessions) {
    if (session.scheduled_at === task.scheduled_at) {
      session.conversation_history = JSON.parse(session.conversation_history || '[]');
      return session;
    }
  }
  
  return null;
}

export async function getScheduledAISessions() {
  const database = getDb();
  const db = promisifyDb(database);

  const now = new Date().toISOString();
  
  const sessions = await db.all(
    `SELECT * FROM ai_sessions 
     WHERE scheduled_at IS NOT NULL 
     AND scheduled_at <= ?
     AND status = 'active'
     ORDER BY scheduled_at ASC`,
    [now]
  );

  return sessions.map(session => ({
    ...session,
    conversation_history: JSON.parse(session.conversation_history || '[]')
  }));
}

export async function updateAISession(sessionId, updates) {
  const database = getDb();
  const db = promisifyDb(database);

  const updateFields = [];
  const values = [];

  if (updates.status !== undefined) {
    updateFields.push('status = ?');
    values.push(updates.status);
  }

  if (updates.conversation_history !== undefined) {
    updateFields.push('conversation_history = ?');
    values.push(JSON.stringify(updates.conversation_history));
  }

  updateFields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(sessionId);

  await db.run(
    `UPDATE ai_sessions SET ${updateFields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function addToConversationHistory(sessionId, entry) {
  const database = getDb();
  const db = promisifyDb(database);

  const session = await getAISession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const history = session.conversation_history || [];
  history.push({
    ...entry,
    timestamp: new Date().toISOString()
  });

  await updateAISession(sessionId, { conversation_history: history });
  return history;
}

