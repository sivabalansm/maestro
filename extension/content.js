// Content script for Maestro Extension
// Executes DOM operations in the page context

(function() {
  'use strict';

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'execute') {
      handleExecution(message.action, message.params)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
    }
  });

  async function handleExecution(action, params) {
    switch (action) {
      case 'click':
        return await executeClick(params);
      case 'fill':
        return await executeFill(params);
      case 'extract':
        return await executeExtract(params);
      case 'custom':
        return await executeCustom(params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async function executeClick(params) {
    const { selector, waitForSelector, timeout = 5000 } = params;

    const element = await waitForElement(selector, timeout);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Scroll element into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Trigger click event
    element.click();

    // If there's a waitForSelector, wait for it to appear
    if (waitForSelector) {
      await waitForElement(waitForSelector, timeout);
    }

    return {
      selector,
      clicked: true,
      tagName: element.tagName,
      text: element.textContent?.trim().substring(0, 100)
    };
  }

  async function executeFill(params) {
    const { selector, value, clearFirst = true } = params;

    const element = await waitForElement(selector, 5000);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA' && element.contentEditable !== 'true') {
      throw new Error(`Element is not fillable: ${selector}`);
    }

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Focus and clear if needed
    element.focus();
    if (clearFirst) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
      } else {
        element.textContent = '';
      }
    }

    // Dispatch input events
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return {
      selector,
      filled: true,
      value: value.substring(0, 100) // Truncate for logging
    };
  }

  async function executeExtract(params) {
    const { selector, attribute, extractText = true } = params;

    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
      throw new Error(`No elements found: ${selector}`);
    }

    const results = Array.from(elements).map(el => {
      const data = {
        tagName: el.tagName,
        text: extractText ? el.textContent?.trim() : undefined
      };

      if (attribute) {
        data[attribute] = el.getAttribute(attribute);
      } else {
        // Extract common attributes
        data.href = el.href || undefined;
        data.src = el.src || undefined;
        data.id = el.id || undefined;
        data.className = el.className || undefined;
      }

      return data;
    });

    return {
      selector,
      count: results.length,
      results: results.length === 1 ? results[0] : results
    };
  }

  async function executeCustom(params) {
    const { script } = params;

    try {
      // Execute script in page context
      const result = new Function('return ' + script)();
      return {
        executed: true,
        result: typeof result === 'object' ? JSON.stringify(result) : result
      };
    } catch (error) {
      throw new Error(`Custom script error: ${error.message}`);
    }
  }

  // Utility: Wait for element to appear
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Utility: Sleep
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Log that content script is loaded
  console.log('[Maestro] Content script loaded');
})();

