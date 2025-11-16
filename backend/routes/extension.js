import express from 'express';
import { sendTaskToExtension, extensionConnections } from '../server.js';

const router = express.Router();

// Register extension
router.post('/register', async (req, res) => {
  try {
    const { extensionId, userId } = req.body;

    if (!extensionId) {
      return res.status(400).json({ error: 'Missing extensionId' });
    }

    // In production, verify extension belongs to user
    // For now, just acknowledge registration

    res.json({
      success: true,
      extensionId,
      connected: extensionConnections.has(extensionId)
    });
  } catch (error) {
    console.error('[Extension] Error registering:', error);
    res.status(500).json({ error: error.message });
  }
});

// Report task result from extension
router.post('/report', async (req, res) => {
  try {
    const { taskId, status, result, error } = req.body;

    // This is handled via WebSocket, but we keep this endpoint for HTTP fallback
    res.json({ success: true, received: true });
  } catch (error) {
    console.error('[Extension] Error reporting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get connected extensions
router.get('/connections', (req, res) => {
  const connections = Array.from(extensionConnections.keys());
  res.json({ connections, count: connections.length });
});

// Get primary connected extension
router.get('/primary', (req, res) => {
  const connections = Array.from(extensionConnections.keys());
  if (connections.length === 0) {
    return res.status(404).json({ error: 'No extensions connected' });
  }
  res.json({ extensionId: connections[0], total: connections.length });
});

// Check connection status
router.get('/status', (req, res) => {
  const connections = Array.from(extensionConnections.keys());
  const isConnected = connections.length > 0;
  res.json({ 
    connected: isConnected, 
    count: connections.length,
    extensionIds: connections 
  });
});

export default router;

