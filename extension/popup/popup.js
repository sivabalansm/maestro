// Popup script for extension UI

const API_URL = 'http://localhost:3001';

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('info');
  const reconnectBtn = document.getElementById('reconnect');
  const stopAgentBtn = document.getElementById('stop-agent');
  const agentStatusEl = document.getElementById('agent-status');
  const agentStatusTextEl = document.getElementById('agent-status-text');

  async function updateStatus() {
    const stored = await chrome.storage.local.get(['extensionId', 'lastConnection']);
    if (stored.extensionId) {
      infoEl.textContent = `Extension ID: ${stored.extensionId.substring(0, 20)}...`;
    }
    // In a real implementation, you'd check WebSocket status
    // For now, we'll assume connected if extensionId exists
    if (stored.extensionId) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'status connected';
      
      // Check for active AI sessions
      try {
        const response = await fetch(`${API_URL}/api/ai/sessions/active?extensionId=${stored.extensionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.sessions && data.sessions.length > 0) {
            agentStatusEl.style.display = 'block';
            agentStatusTextEl.textContent = `Active (${data.sessions.length} session${data.sessions.length > 1 ? 's' : ''})`;
            agentStatusTextEl.style.color = '#28a745';
            stopAgentBtn.style.display = 'block';
          } else {
            agentStatusEl.style.display = 'block';
            agentStatusTextEl.textContent = 'Inactive';
            agentStatusTextEl.style.color = '#6c757d';
            stopAgentBtn.style.display = 'none';
          }
        }
      } catch (error) {
        console.error('Error checking agent status:', error);
      }
    }
  }

  reconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'reconnect' });
    updateStatus();
  });

  stopAgentBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get(['extensionId']);
    if (!stored.extensionId) {
      alert('Extension ID not found');
      return;
    }

    stopAgentBtn.disabled = true;
    stopAgentBtn.textContent = 'Stopping...';

    try {
      const response = await fetch(`${API_URL}/api/ai/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          extensionId: stored.extensionId
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Agent stopped. ${data.cancelledSessions || 0} session(s) cancelled.`);
        updateStatus();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to stop agent'}`);
      }
    } catch (error) {
      console.error('Error stopping agent:', error);
      alert('Error stopping agent. Please check console.');
    } finally {
      stopAgentBtn.disabled = false;
      stopAgentBtn.textContent = 'Stop Agent';
    }
  });

  updateStatus();
  setInterval(updateStatus, 3000); // Check every 3 seconds
});

