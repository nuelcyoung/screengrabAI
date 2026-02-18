// Import utility functions
function generateRandomId(prefix = '') {
  const randomString = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${randomString}` : randomString;
}

// Generate random IDs for stealth
const FLOAT_BTN_ID = generateRandomId('sg_float_btn');
const MENU_ID = generateRandomId('sg_menu');

// Floating icon for screenshot capture
let floatBtn = null;
let menu = null;
let isEnabled = false;

// Create floating button
function createFloatBtn() {
  if (floatBtn) return;

  // Cleanup orphan from previous injection
  const existing = document.getElementById(FLOAT_BTN_ID);
  if (existing) existing.remove();

  floatBtn = document.createElement('div');
  floatBtn.id = FLOAT_BTN_ID;
  floatBtn.className = 'sg-float-btn';
  floatBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  `;
  floatBtn.addEventListener('click', toggleMenu);
  document.body.appendChild(floatBtn);
}

// Create menu
function createMenu() {
  if (menu) return;

  // Cleanup orphan
  const existing = document.getElementById(MENU_ID);
  if (existing) existing.remove();

  menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'sg-menu';
  menu.innerHTML = `
    <div class="menu-item" data-mode="visible">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <span>Visible Tab</span>
    </div>
    <div class="menu-item" data-mode="full">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>Full Page</span>
    </div>
    <div class="menu-item" data-mode="area">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 3h4M3 5v4M19 3h-4M21 5v4M5 21h4M3 19v-4M19 21h-4M21 19v-4"/>
      </svg>
      <span>Select Area</span>
    </div>
  `;

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const mode = e.currentTarget.dataset.mode;

      // Immediately hide both menu and floating button for cleaner UX
      hideMenu();
      if (floatBtn) floatBtn.style.display = 'none';

      // Start capture and wait for it to initialize
      await startCapture(mode);
    });
  });

  document.body.appendChild(menu);
}

// Toggle menu visibility
function toggleMenu() {
  if (menu && menu.classList.contains('sg-visible')) {
    hideMenu();
  } else {
    showMenu();
  }
}

function showMenu() {
  if (!menu) createMenu();
  menu.classList.add('sg-visible');
}

function hideMenu() {
  if (menu) menu.classList.remove('sg-visible');
}

// Check if extension context is still valid
async function isExtensionContextValid() {
  try {
    // Try to get the URL - this will fail if context is invalidated
    await chrome.runtime.getURL('');
    return true;
  } catch (error) {
    return false;
  }
}

// Start capture - uses storage-based queue to avoid connection errors
async function startCapture(mode) {
  // Check if extension context is still valid
  const contextValid = await isExtensionContextValid();
  if (!contextValid) {
    // Show error using the shared progress indicator
    try {
      await chrome.runtime.sendMessage({
        action: 'showFloatingProgress'
      });
      await chrome.runtime.sendMessage({
        action: 'updateFloatingProgress',
        step: 0,
        percent: 0,
        status: 'Error',
        stats: 'Extension was reloaded. Please reload this page to continue.'
      });
    } catch (e) {
      // Fallback to alert
      alert('Extension was reloaded. Please reload this page to continue.');
    }
    return;
  }

  // Hide floating icon and menu during capture
  if (floatBtn) floatBtn.style.display = 'none';
  hideMenu();

  // Reset any previous capture state before starting new capture
  await chrome.storage.local.remove(['captureRequest', 'currentCapture']);

  try {
    // Enqueue the capture request (background.js uses storage listeners)
    await chrome.storage.local.set({
      captureRequest: {
        id: `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        mode: mode,
        url: window.location.href,
        timestamp: Date.now(),
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('[Floating Icon] Start capture error:', error);
    // Show error
    if (floatBtn) floatBtn.style.display = '';
  }
}

// Listen for storage changes to update UI status
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // Wrap everything in try-catch to handle context invalidation gracefully
  try {
    if (changes.currentCapture && changes.currentCapture.newValue) {
      const state = changes.currentCapture.newValue;

      switch (state.status) {
        case 'capturing':
          // Progress indicator handles this via background script
          break;
        case 'selecting':
          // Progress indicator handles this via background script
          break;
        case 'processing':
          // Progress indicator handles this via background script
          break;
        case 'analyzing':
          // Progress indicator handles this via background script
          break;
        case 'complete':
          // Clear storage state after completion
          chrome.storage.local.remove(['currentCapture', 'captureRequest']);
          if (state.result) {
            showResultOnPage(state.result);
          }
          if (floatBtn) floatBtn.style.display = '';
          break;
        case 'error':
          // Clear storage state after error
          chrome.storage.local.local.remove(['currentCapture', 'captureRequest']);
          if (floatBtn) floatBtn.style.display = '';
          break;
        case 'cancelled':
          // Clear storage state after cancellation
          chrome.storage.local.remove(['currentCapture', 'captureRequest']);
          if (floatBtn) floatBtn.style.display = '';
          break;
      }
    }
  } catch (error) {
    // If we get here, the extension context was invalidated during the operation
    console.error('[Floating Icon] Storage listener error:', error);
    if (error.message.includes('Extension context') || error.message.includes('context invalidated')) {
      if (floatBtn) floatBtn.style.display = '';
    }
  }
});

// Clear capture state when modal is closed
async function clearCaptureState() {
  // Clear ALL storage state related to captures (may fail if extension was reloaded, that's ok)
  try {
    await chrome.storage.local.remove([
      'currentCapture',
      'captureRequest',
      'areaSelection',
      'activeCaptureTabId'
    ]);
  } catch (error) {
    // Ignore storage errors during cleanup
  }

  // Hide menu if open
  hideMenu();

  // Ensure floating icon is visible
  if (floatBtn) floatBtn.style.display = '';

  // Clear the result display reference if it exists
  if (window.__sg_current_result_display) {
    window.__sg_current_result_display = null;
  }
}

// Show result on-page using result-display component
async function showResultOnPage(resultHtml) {
  try {
    // Ensure ResultDisplay is loaded (it's loaded as a content script, just wait for it)
    let attempts = 0;
    const maxAttempts = 10;

    while (!window.ResultDisplay && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.ResultDisplay) {
      // Fallback: show in alert
      alert('Analysis complete!');
      return;
    }

    // Create and show result display
    if (window.__sg_current_result_display) {
      window.__sg_current_result_display.destroy();
    }
    window.__sg_current_result_display = new window.ResultDisplay();

    // Register cleanup callback to clear state when modal is closed
    window.__sg_current_result_display.setOnClose(clearCaptureState);

    // Register follow-up callback
    window.__sg_current_result_display.setOnFollowUp(handleFollowUpQuestion);

    // Parse initial result to build conversation history
    const conversationHistory = parseResultToConversation(resultHtml);
    window.__sg_current_result_display.setConversationHistory(conversationHistory);

    window.__sg_current_result_display.showResult(resultHtml);
  } catch (error) {
    console.error('[Floating Icon] Failed to show result on-page:', error);
  }
}

// Parse the result HTML into conversation history format
function parseResultToConversation(resultHtml) {
  const history = [];

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = resultHtml;

  const h2Elements = tempDiv.querySelectorAll('h2');

  // If there are h2 tags, extract content by sections
  if (h2Elements.length > 0) {
    let accumulatedContent = '';

    h2Elements.forEach((h2) => {
      const sectionName = h2.textContent;
      let sectionContent = '';

      let nextElement = h2.nextElementSibling;
      while (nextElement && nextElement.tagName !== 'H2') {
        sectionContent += nextElement.textContent + '\n';
        nextElement = nextElement.nextElementSibling;
      }

      accumulatedContent += `**${sectionName}**\n${sectionContent.trim()}\n\n`;
    });

    if (accumulatedContent.trim()) {
      history.push({ role: 'assistant', content: accumulatedContent.trim() });
    }
  } else {
    // No h2 tags - extract all text content from the result
    const allText = tempDiv.textContent?.trim();
    if (allText) {
      history.push({ role: 'assistant', content: allText });
    }
  }

  return history;
}

// Handle follow-up question submission
async function handleFollowUpQuestion(question, conversationHistory, displayInstance) {
  // Use the passed instance or fall back to global
  const resultDisplay = displayInstance || window.__sg_current_result_display;
  
  try {
    // Check if extension context is still valid
    const contextValid = await isExtensionContextValid();
    if (!contextValid) {
      throw new Error('Extension was reloaded. Please reload this page to continue.');
    }

    // Show loading state
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(true);
    }

    // Send to background script for processing
    const response = await chrome.runtime.sendMessage({
      action: 'followUpQuestion',
      question: question,
      conversationHistory: conversationHistory
    });

    if (response && response.success) {
      // Use the response directly
      if (resultDisplay) {
        resultDisplay.setFollowUpLoading(false);
        resultDisplay.appendFollowUpResponse(response.response);
      }
    } else {
      throw new Error(response?.error || 'Failed to process follow-up question');
    }
  } catch (error) {
    console.error('[Floating Icon] Follow-up question error:', error);
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(false);
      // Show error in the message area
      resultDisplay.appendFollowUpResponse(
        `Error: ${error.message}`
      );
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check if floating icon should be enabled
async function checkEnabled() {
  // Simplified - don't wait for service worker, just check settings directly
  // Storage works independently of service worker state
  try {
    const stored = await chrome.storage.local.get('screengrabSettings');
    const settings = stored.screengrabSettings || {};
    isEnabled = settings.floatingIconEnabled !== false; // Default to true

    if (isEnabled) {
      createFloatBtn();
    } else if (floatBtn) {
      floatBtn.classList.add('hidden');
    }
  } catch (error) {
    console.error('[Floating Icon] Error checking settings:', error);
    // Create icon anyway on error as a fallback
    createFloatBtn();
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    // Respond to ping - if we can respond, context is valid
    sendResponse({ ready: true });
  } else if (request.action === 'reload') {
    // Extension was reloaded - refresh the page to get new content script
    window.location.reload();
  } else if (request.action === 'showResult') {
    if (request.result) {
      showResultOnPage(request.result);
    }
    // Show floating icon again after showing result
    if (floatBtn) floatBtn.style.display = '';
    sendResponse({ success: true });
  } else if (request.action === 'hideStatus') {
    // Show floating icon again when hiding status
    if (floatBtn) floatBtn.style.display = '';
    sendResponse({ success: true });
  } else if (request.action === 'toggleFloatingIcon') {
    isEnabled = request.enabled;
    if (isEnabled) {
      if (floatBtn) floatBtn.classList.remove('sg-hidden');
      else createFloatBtn();
    } else if (floatBtn) {
      floatBtn.classList.add('sg-hidden');
      hideMenu();
    }
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});

// Initialize
checkEnabled();

// Handle extension context invalidation - show message if detected
chrome.runtime.onSuspend?.addListener(() => {
  // Extension context is being suspended
});
