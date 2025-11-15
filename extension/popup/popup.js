// Popup script for extension UI

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('info');
  const reconnectBtn = document.getElementById('reconnect');

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
    }
  }

  reconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'reconnect' });
    updateStatus();
  });

  updateStatus();
  setInterval(updateStatus, 5000);
});

