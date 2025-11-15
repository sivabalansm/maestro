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
      case 'extractPageHtml':
        return await executeExtractPageHtml(params);
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

  async function executeExtractPageHtml(params) {
    // Extract structured page information instead of full HTML
    const interactiveElements = [];
    
    // Get all interactive elements
    const selectors = [
      'button',
      'input',
      'textarea',
      'select',
      'a[href]',
      '[onclick]',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[tabindex]:not([tabindex="-1"])'
    ];
    
    const allElements = document.querySelectorAll(selectors.join(', '));
    
    allElements.forEach((el, index) => {
      // Skip hidden elements
      if (el.offsetParent === null && el.style.display === 'none') {
        return;
      }
      
      const element = {
        index: index,
        tagName: el.tagName.toLowerCase(),
        type: getElementType(el),
        selector: generateSelector(el),
        label: getElementLabel(el),
        value: getElementValue(el),
        attributes: getRelevantAttributes(el),
        visible: isElementVisible(el)
      };
      
      interactiveElements.push(element);
    });
    
    // Get page metadata
    const pageInfo = {
      url: window.location.href,
      title: document.title,
      description: getMetaDescription(),
      headings: getHeadings(),
      interactiveElements: interactiveElements.filter(el => el.visible).slice(0, 200) // Limit to 200 elements
    };
    
    return pageInfo;
  }
  
  function getElementType(el) {
    if (el.tagName === 'INPUT') {
      return el.type || 'text';
    }
    if (el.tagName === 'BUTTON') return 'button';
    if (el.tagName === 'A') return 'link';
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.hasAttribute('role')) return el.getAttribute('role');
    if (el.hasAttribute('onclick')) return 'clickable';
    return 'interactive';
  }
  
  function generateSelector(el) {
    // Try ID first
    if (el.id) {
      return `#${el.id}`;
    }
    
    // Try data attributes
    if (el.hasAttribute('data-testid')) {
      return `[data-testid="${el.getAttribute('data-testid')}"]`;
    }
    if (el.hasAttribute('data-id')) {
      return `[data-id="${el.getAttribute('data-id')}"]`;
    }
    
    // Try name attribute for forms
    if (el.name) {
      return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    }
    
    // Try class with tag
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c && !c.includes(' '));
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}.${classes[0]}`;
      }
    }
    
    // Fallback to tag + nth-of-type
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      const index = siblings.indexOf(el);
      return `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
    }
    
    return el.tagName.toLowerCase();
  }
  
  function getElementLabel(el) {
    // Try aria-label
    if (el.getAttribute('aria-label')) {
      return el.getAttribute('aria-label').trim();
    }
    
    // Try text content for buttons/links
    if (el.tagName === 'BUTTON' || el.tagName === 'A') {
      const text = el.textContent?.trim();
      if (text && text.length < 100) {
        return text;
      }
    }
    
    // Try associated label
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) {
        return label.textContent?.trim();
      }
    }
    
    // Try placeholder
    if (el.placeholder) {
      return el.placeholder;
    }
    
    // Try title
    if (el.title) {
      return el.title;
    }
    
    // Try alt for images
    if (el.alt) {
      return el.alt;
    }
    
    return '';
  }
  
  function getElementValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value || '';
    }
    if (el.tagName === 'SELECT') {
      return el.options[el.selectedIndex]?.text || '';
    }
    return '';
  }
  
  function getRelevantAttributes(el) {
    const attrs = {};
    const relevant = ['id', 'name', 'type', 'placeholder', 'href', 'src', 'aria-label', 'role', 'data-testid'];
    
    relevant.forEach(attr => {
      if (el.hasAttribute(attr)) {
        attrs[attr] = el.getAttribute(attr);
      }
    });
    
    return attrs;
  }
  
  function isElementVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           el.offsetWidth > 0 && 
           el.offsetHeight > 0;
  }
  
  function getMetaDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : '';
  }
  
  function getHeadings() {
    const headings = [];
    const hElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    hElements.forEach(h => {
      const text = h.textContent?.trim();
      if (text && text.length < 200) {
        headings.push({
          level: parseInt(h.tagName.substring(1)),
          text: text
        });
      }
    });
    return headings.slice(0, 10); // Limit to 10 headings
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

