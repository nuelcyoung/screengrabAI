// Floating Icon for ScreenGrab - Simplified Single-Click Flow
// Click → Select Area → Image Analysis → Text Analysis → Result Display

// ============================================================================
// CONSTANTS & SETUP
// ============================================================================

const FLOAT_BTN_ID = (typeof generateRandomId === 'function')
  ? generateRandomId('sg_float_btn')
  : 'sg_float_btn_' + Math.random().toString(36).substr(2, 9);

const MENU_ID = (typeof generateRandomId === 'function')
  ? generateRandomId('sg_menu')
  : 'sg_menu_' + Math.random().toString(36).substr(2, 9);

let floatBtn = null;
let menu = null;
let shadowRoot = null;
let menuShadowRoot = null;
let isEnabled = false;
let isPolling = false;


// ============================================================================
// UI CREATION
// ============================================================================

function cleanupPreviousInstances() {
  document.querySelectorAll('[id^="sg_float_btn"], [id^="sg_menu"]').forEach(el => el.remove());
  document.querySelectorAll('.sg-float-btn').forEach(el => el.remove());
}

function createMenu() {
  if (menu) {
    return;
  }

  const existing = document.getElementById(MENU_ID);
  if (existing) {
    existing.remove();
  }

  menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.style.cssText = `
    all: initial;
    position: fixed;
    bottom: 115px;
    right: 20px;
    z-index: 2147483647;
    display: none;
  `;

  menuShadowRoot = menu.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .menu-container {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(139, 92, 246, 0.3);
      min-width: 180px;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #e4e4e7;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .menu-item:hover {
      background: rgba(139, 92, 246, 0.2);
      border-color: rgba(139, 92, 246, 0.4);
    }
    .menu-item svg {
      width: 18px;
      height: 18px;
      color: #8b5cf6;
      pointer-events: none;
      flex-shrink: 0;
    }
    .menu-item span {
      pointer-events: none;
      white-space: nowrap;
    }
  `;
  menuShadowRoot.appendChild(style);

  const menuContainer = document.createElement('div');
  menuContainer.className = 'menu-container';
  menuContainer.innerHTML = `
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

  menuContainer.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const mode = item.dataset.mode;

      // Disable menu items immediately to prevent double-clicks
      menuContainer.querySelectorAll('.menu-item').forEach(mi => {
        mi.style.pointerEvents = 'none';
        mi.style.opacity = '0.5';
      });

      // Hide menu immediately Before capture blocking call
      hideMenu();

      // Start capture immediately
      await startCapture(mode);

      // Re-enable items after capture finishes polling
      menuContainer.querySelectorAll('.menu-item').forEach(mi => {
        mi.style.pointerEvents = '';
        mi.style.opacity = '1';
      });
    });
  });

  // Prevent clicks on menu container from closing it
  menuContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  menuShadowRoot.appendChild(menuContainer);
  document.body.appendChild(menu);
}

function toggleMenu() {
  if (!menu) createMenu();
  if (menu.style.display === 'flex') {
    hideMenu();
  } else {
    showMenu();
  }
}

function showMenu() {
  if (!menu) createMenu();
  menu.style.display = 'flex';

  // Add click-outside-to-close handler
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 10);
}

function hideMenu() {
  if (menu) menu.style.display = 'none';

  // Remove click-outside handler
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  // Check if click is outside both button and menu
  const clickedButton = floatBtn?.contains(e.target);
  const clickedMenu = menu?.contains(e.target);

  if (!clickedButton && !clickedMenu) {
    hideMenu();
  }
}

function createFloatingButton() {
  if (floatBtn) {
    return;
  }

  cleanupPreviousInstances();

  const existing = document.getElementById(FLOAT_BTN_ID);
  if (existing) {
    existing.remove();
  }

  floatBtn = document.createElement('div');
  floatBtn.id = FLOAT_BTN_ID;
  floatBtn.style.cssText = `
    all: initial;
    position: fixed;
    bottom: 50px;
    right: 20px;
    z-index: 2147483647;
  `;

  shadowRoot = floatBtn.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .container {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
      transition: all 0.3s ease;
      opacity: 0.9;
    }
    .container:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 25px rgba(139, 92, 246, 0.6);
      opacity: 1;
    }
    .container:active {
      transform: scale(0.95);
    }
    .container.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
    svg {
      width: 28px;
      height: 28px;
      color: white;
      pointer-events: none;
    }
  `;
  shadowRoot.appendChild(style);

  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  `;

  container.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  shadowRoot.appendChild(container);
  document.body.appendChild(floatBtn);
}

function hideFloatingButton() {
  if (floatBtn) {
    const container = shadowRoot?.querySelector('.container');
    if (container) {
      container.classList.add('disabled');
    }
    floatBtn.style.pointerEvents = 'none';
    floatBtn.style.opacity = '0.5';
  }
}

function showFloatingButton() {
  if (floatBtn) {
    const container = shadowRoot?.querySelector('.container');
    if (container) {
      container.classList.remove('disabled');
    }
    floatBtn.style.pointerEvents = '';
    floatBtn.style.opacity = '0.9';
  }
}

// ============================================================================
// CAPTURE FLOW - Select Mode → Capture → Vision → Text → Result
// ============================================================================

async function startCapture(mode) {

  // Don't start if already polling
  if (isPolling) {
    return;
  }

  // Reset result shown flag from previous capture
  window.__sg_resultShown = false;

  // -----------------------------------------------------------------------
  // AREA MODE: Use direct messaging to background.js (same approach as
  // popup.js). This bypasses the storage-based queue entirely, avoiding
  // race conditions where the service worker startup cleanup deletes the
  // captureRequest before it can be processed, or where a stale
  // chrome.storage.session lock (unreachable from content scripts) blocks
  // processQueuedRequest().
  // -----------------------------------------------------------------------
  if (mode === 'area') {
    try {
      // Disable button ONLY after we know the message will be sent
      hideFloatingButton();
      isPolling = true;

      // Clear stale state in local storage (session lock can't be cleared
      // from content scripts, but background.js handles that via TTL)
      await CaptureQueue.reset();

      // Send direct message — background.js handleStartAreaSelection
      // enqueues + processes in one step, no storage listener timing issues
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'startAreaSelection',
          url: window.location.href
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to start area selection'));
          }
        });
      });

      // Area selection was started successfully — now poll for the result
      // (the user will draw the selection, then background.js processes it)
      await new Promise(resolve => setTimeout(resolve, 300));
      await pollForCaptureResult();
    } catch (error) {
      console.error('[Floating Icon] Area selection error:', error);
      showExtensionErrorIfNeeded(error);
      showFloatingButton();
      isPolling = false;
    }
    return;
  }

  // -----------------------------------------------------------------------
  // VISIBLE / FULL MODE: Use the storage-based queue (no injection needed,
  // so the service worker race condition doesn't cause issues here).
  // -----------------------------------------------------------------------
  hideFloatingButton();

  try {
    isPolling = true;

    // Force-clear any stale state/locks from previous captures
    // Note: session lock clear will silently fail from content script,
    // but background.js lock TTL handles stale locks automatically
    await CaptureQueue.reset();

    await CaptureQueue.enqueue({
      mode: mode,
      url: window.location.href
    });

    // Add a small delay to allow the background service worker to start processing
    // This ensures the state is updated before we start polling
    await new Promise(resolve => setTimeout(resolve, 300));

    await pollForCaptureResult();
  } catch (error) {
    console.error('[Floating Icon] Capture error:', error);
    showExtensionErrorIfNeeded(error);
    showFloatingButton();
    isPolling = false;
  }
}

// Show reload toast if extension context was invalidated
function showExtensionErrorIfNeeded(error) {
  if (error.message && error.message.includes('Extension context invalidated')) {
    console.error('[Floating Icon] Extension was reloaded. Please reload the page.');

    const toast = document.createElement('div');
    toast.textContent = 'Extension was updated. Please reload this page.';
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 20px;
      background: #f87171;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = 'Reload Now';
    reloadBtn.style.cssText = `
      margin-left: 10px;
      background: white;
      color: #f87171;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
    `;
    reloadBtn.onclick = () => window.location.reload();
    toast.appendChild(reloadBtn);

    setTimeout(() => toast.remove(), 10000);
  }
}

async function pollForCaptureResult() {
  const maxWait = 120000;
  const pollInterval = 500;
  let elapsed = 0;

  try {
    while (elapsed < maxWait) {
      // Check if result was shown via message handler (from background.js)
      // If so, stop polling to avoid duplicate error handling
      if (window.__sg_resultShown) {
        window.__sg_resultShown = false;  // Reset for next capture
        return;
      }

      const state = await CaptureQueue.getState();

      if (state) {

        // Update progress based on state
        await updateProgress(state);

        // Check for completion
        if (state.status === 'complete' && state.result) {
          await handleComplete(state.result);
          return;
        } else if (state.status === 'error') {
          await handleError(state.error || 'Unknown error');
          return;
        } else if (state.status === 'cancelled') {
          await handleCancelled();
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;
    }

    // Timeout - but check if result was already shown via message handler
    if (window.__sg_resultShown) {
      window.__sg_resultShown = false;  // Reset for next capture
      return;
    }

    // Timeout
    await handleError('Capture timed out. Please try again.');
  } catch (error) {
    // Handle extension context invalidated error during polling
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Floating Icon] Extension was reloaded during polling.');
      showFloatingButton();

      // Show user-friendly message
      const toast = document.createElement('div');
      toast.textContent = 'Extension was updated. Please reload this page.';
      toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: #f87171;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 2147483647;
        animation: fadeIn 0.3s ease;
      `;
      document.body.appendChild(toast);

      // Add reload button
      const reloadBtn = document.createElement('button');
      reloadBtn.textContent = 'Reload Now';
      reloadBtn.style.cssText = `
        margin-left: 10px;
        background: white;
        color: #f87171;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
      `;
      reloadBtn.onclick = () => window.location.reload();
      toast.appendChild(reloadBtn);

      // Auto-remove after 10 seconds
      setTimeout(() => toast.remove(), 10000);
    } else {
      // Other errors - let them propagate
      throw error;
    }
  } finally {
    isPolling = false;
  }
}

async function updateProgress(state) {
  if (!window.SGProgressIndicator) return;

  try {
    switch (state.status) {
      case 'capturing':
        // Don't show progress during capture - wait for analysis
        break;
      case 'selecting':
        // Don't show progress during area selection - overlay is the UI
        break;
      case 'processing':
        // Show progress when processing starts (after area selection)
        await window.SGProgressIndicator.show();
        await window.SGProgressIndicator.update(1, 40, 'Processing', 'Processing screenshot...');
        break;
      case 'analyzing':
        // Show progress when analysis starts (after capture is complete)
        await window.SGProgressIndicator.show();
        await window.SGProgressIndicator.update(2, 70, 'Analyzing', 'AI Analysis in progress...');
        break;
    }
  } catch (e) {
  }
}

async function handleComplete(result) {

  // Hide progress
  if (window.SGProgressIndicator) {
    window.SGProgressIndicator.hide();
  }

  // Reset state
  await CaptureQueue.reset();

  // Show result
  await showResultOnPage(result);

  // Show button
  showFloatingButton();
}

async function handleError(error) {

  // Hide progress
  if (window.SGProgressIndicator) {
    window.SGProgressIndicator.hide();
  }

  // Reset state
  await CaptureQueue.reset();

  // Show error
  const errorHtml = `<div class="error" style="padding: 20px; border-left: 4px solid #ef4444; background: #fef2f2; border-radius: 4px;">
    <h2 style="color: #dc2626; margin-top: 0;">⚠️ Error</h2>
    <p style="color: #7f1d1d; font-size: 14px;">${typeof escapeHtml === 'function' ? escapeHtml(error) : error}</p>
  </div>`;
  await showResultOnPage(errorHtml);

  // Show button
  showFloatingButton();
}

async function handleCancelled() {

  // Hide progress
  if (window.SGProgressIndicator) {
    window.SGProgressIndicator.hide();
  }

  // Reset state
  await CaptureQueue.reset();

  // Show button (no error message needed for cancellation)
  showFloatingButton();
}

// ============================================================================
// RESULT DISPLAY
// ============================================================================

async function showResultOnPage(resultHtml) {
  try {
    // Wait for ResultDisplay to be available
    let attempts = 0;
    const maxAttempts = 10;

    while (!window.ResultDisplay && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.ResultDisplay) {
      alert('Analysis complete!');
      return;
    }

    // Create and show result display
    if (window.__sg_current_result_display) {
      window.__sg_current_result_display.destroy();
    }
    window.__sg_current_result_display = new window.ResultDisplay();

    // Register callbacks
    window.__sg_current_result_display.setOnClose(clearCaptureState);
    window.__sg_current_result_display.setOnFollowUp(handleFollowUpQuestion);

    // Parse and set conversation history
    const conversationHistory = parseResultToConversation(resultHtml);
    window.__sg_current_result_display.setConversationHistory(conversationHistory);

    window.__sg_current_result_display.showResult(resultHtml);
  } catch (error) {
  }
}

function parseResultToConversation(resultHtml) {
  const history = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = resultHtml;

  const h2Elements = tempDiv.querySelectorAll('h2');

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
    const allText = tempDiv.textContent?.trim();
    if (allText) {
      history.push({ role: 'assistant', content: allText });
    }
  }

  return history;
}

async function clearCaptureState() {
  hideMenu();
  if (window.SGProgressIndicator) {
    try {
      window.SGProgressIndicator.hide();
    } catch (e) {
      // Ignore
    }
  }
  showFloatingButton();
  if (window.__sg_current_result_display) {
    window.__sg_current_result_display = null;
  }
}

// ============================================================================
// FOLLOW-UP QUESTIONS
// ============================================================================

async function handleFollowUpQuestion(question, conversationHistory, displayInstance) {
  const resultDisplay = displayInstance || window.__sg_current_result_display;

  try {
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(true);
    }

    await CaptureQueue.requestFollowUp(question, conversationHistory);

    // Add delay to allow background service worker to start processing
    await new Promise(resolve => setTimeout(resolve, 300));

    await pollForFollowUpResponse(resultDisplay);
  } catch (error) {
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(false);
      resultDisplay.appendFollowUpResponse(`Error: ${error.message}`);
    }
  }
}

async function pollForFollowUpResponse(resultDisplay) {
  const maxWait = 120000;
  const pollInterval = 500;
  let elapsed = 0;

  while (elapsed < maxWait) {
    const response = await CaptureQueue.getFollowUpResponse();

    if (response) {
      await CaptureQueue.clearFollowUpResponse();

      if (resultDisplay) {
        resultDisplay.setFollowUpLoading(false);
        if (response.error) {
          resultDisplay.appendFollowUpResponse(`Error: ${response.error}`);
        } else {
          resultDisplay.appendFollowUpResponse(response.response);
        }
      }
      return;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  // Timeout
  if (resultDisplay) {
    resultDisplay.setFollowUpLoading(false);
    resultDisplay.appendFollowUpResponse('Error: Request timed out. Please try again.');
  }
}

// ============================================================================
// SETTINGS & INITIALIZATION
// ============================================================================

async function checkEnabled() {
  try {
    const stored = await chrome.storage.local.get('screengrabSettings');
    const settings = stored.screengrabSettings || {};
    isEnabled = settings.floatingIconEnabled !== false;


    if (isEnabled) {
      createFloatingButton();
    } else if (floatBtn) {
      if (floatBtn) floatBtn.remove();
      floatBtn = null;
    }
  } catch (error) {
    createFloatingButton();
  }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'ping') {
      sendResponse({ ready: true });
    } else if (request.action === 'reload') {
      window.location.reload();
    } else if (request.action === 'hideStatus') {
      showFloatingButton();
      sendResponse({ success: true });
    } else if (request.action === 'toggleFloatingIcon') {
      isEnabled = request.enabled;
      if (isEnabled) {
        if (!floatBtn) {
          createFloatingButton();
        } else {
          showFloatingButton();
        }
      } else {
        hideMenu();
        if (floatBtn) floatBtn.remove();
        floatBtn = null;
      }
      sendResponse({ success: true });
    } else if (request.action === 'showResult') {
      // Result sent from background.js
      showResultOnPage(request.result);
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('[Floating Icon] Message handler error:', error);
    try {
      sendResponse({ success: false, error: error.message });
    } catch (e) {
      // Context already invalidated, can't send response
    }
  }
  return true;
});

// ============================================================================
// INITIALIZATION
// ============================================================================


// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    checkEnabled();
  });
} else {
  checkEnabled();
}

// Handle extension context invalidation
// Detect when extension is reloaded/uninstalled and show reload message
window.addEventListener('beforeunload', () => {
  // Clean up when page is unloading
  if (floatBtn) {
    floatBtn.remove();
  }
  if (menu) {
    menu.remove();
  }
});

// Handle messages that might fail due to context invalidation
const originalSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = function(...args) {
  return originalSendMessage.apply(this, args).catch(error => {
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Floating Icon] Extension context invalidated');
      // Show reload notification
      if (!document.querySelector('.sg-reload-toast')) {
        const toast = document.createElement('div');
        toast.className = 'sg-reload-toast';
        toast.textContent = 'Extension was updated. Please reload this page.';
        toast.style.cssText = `
          position: fixed;
          bottom: 100px;
          right: 20px;
          background: #f87171;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 2147483647;
        `;
        document.body.appendChild(toast);

        const reloadBtn = document.createElement('button');
        reloadBtn.textContent = 'Reload Now';
        reloadBtn.style.cssText = `
          margin-left: 10px;
          background: white;
          color: #f87171;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
        `;
        reloadBtn.onclick = () => window.location.reload();
        toast.appendChild(reloadBtn);
      }
    } else {
      throw error;
    }
  });
};
