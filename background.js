// Background service worker for handling captures
// Health sector compliance: Secure data handling and privacy protection

// Import utility functions first (provides parseMarkdown, escapeHtml, sanitizeSensitiveData)
importScripts('utils.js');
// Import AIService for centralized API calls
importScripts('ai-service.js');
// Import MultimodalService for unified and redirect mode support
importScripts('ai-service-multimodal.js');
// Import CaptureQueue for storage-based communication
importScripts('capture-queue.js');

let pollingActive = false;

// Ensure offscreen document exists for image operations
async function ensureOffscreenDocument() {
  const existingContext = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContext.length > 0) {
    return; // Already exists
  }

  // Create new offscreen document
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: ['IMAGE_PROCESSING'],
    justify: 'Image resizing and processing for screenshot capture'
  });
}

// Resize image if needed to prevent API 413 errors
// Accepts either full data URL or bare base64 string
async function resizeImageIfNeeded(imageData, maxSize = 1920) {
  try {
    // Extract base64 from data URL if needed
    const base64Image = imageData.startsWith('data:') 
      ? imageData.split(',')[1] 
      : imageData;

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Call resizeImage in offscreen document
    const response = await chrome.runtime.sendMessage({
      action: 'resizeImage',
      base64Image,
      maxSize
    });

    if (response && response.dataUrl) {
      return response.dataUrl;
    }

    // If resize failed, return original base64 (not full data URL)
    return base64Image;
  } catch (error) {
    console.warn('[Background] Image resize failed, using original:', error.message);
    // Return original base64 (not full data URL)
    return imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
  }
}

// Check if URL is restricted
function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedPatterns = [
    'chrome://', 'chrome-extension://', 'edge://', 'opera://', 'about:',
    'moz-extension://', 'chrome-error://', 'https://chromewebstore.google.com/',
    'https://chrome.google.com/webstore'
  ];
  return restrictedPatterns.some(pattern => url.startsWith(pattern));
}

// Flag to prevent recursive storage listener calls
let _isProcessingStorageChange = false;

// Listen for storage changes to handle capture requests and area selections
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // Prevent recursive calls when we modify storage
  if (_isProcessingStorageChange) {
    return;
  }

  try {
    _isProcessingStorageChange = true;

    // Handle new capture requests
    if (changes.captureRequest && changes.captureRequest.newValue) {
      const request = changes.captureRequest.newValue;
      setTimeout(() => {
        _isProcessingStorageChange = false;
        processQueuedRequest();
      }, 0);
      return;
    }

    // Handle area selection completion
    if (changes.areaSelection && changes.areaSelection.newValue !== undefined) {
      setTimeout(() => {
        _isProcessingStorageChange = false;
        handleAreaSelectionChange(changes.areaSelection.newValue);
      }, 0);
      return;
    }

    // Handle follow-up requests
    if (changes.followUpRequest && changes.followUpRequest.newValue) {
      setTimeout(() => {
        _isProcessingStorageChange = false;
        processFollowUpRequest();
      }, 0);
      return;
    }

    // Reset state when capture completes
    if (changes.currentCapture && changes.currentCapture.newValue) {
      const status = changes.currentCapture.newValue.status;
      if (status === 'complete' || status === 'error' || status === 'cancelled') {
        // Clear in-memory flag (secondary mechanism)
        pollingActive = false;
        // Also clear the processing lock to ensure clean state
        chrome.storage.session.remove(CaptureQueue.KEYS.PROCESSING_LOCK).catch(() => {});
      }
    }

    _isProcessingStorageChange = false;
  } catch (error) {
    _isProcessingStorageChange = false;
    console.error('[Background] Storage listener error:', error);
  }
});

// Process queued request (called from storage listener)
async function processQueuedRequest() {
  // Check processing lock (persists across service worker restarts)
  // This is more reliable than the in-memory pollingActive flag
  try {
    const lockData = await chrome.storage.session.get(CaptureQueue.KEYS.PROCESSING_LOCK);
    const lock = lockData[CaptureQueue.KEYS.PROCESSING_LOCK];
    if (lock) {
      // Check if lock is still within TTL (30s) — stale locks are ignored
      if (lock.timestamp && (Date.now() - lock.timestamp < 30000)) {
        return;  // Valid lock, still processing
      }
      // Stale lock — clear it and proceed
      console.warn('[Background] Clearing stale processing lock (age:', Date.now() - (lock.timestamp || 0), 'ms)');
      await chrome.storage.session.remove(CaptureQueue.KEYS.PROCESSING_LOCK);
    }
  } catch (e) {
    console.warn('[Background] Could not check processing lock:', e);
  }

  try {
    const request = await CaptureQueue.dequeue();
    if (!request) {
      return;
    }

    pollingActive = true;
    let { mode, tabId, url } = request;

    // Fallback: If tabId is missing (from floating icon), find the active tab
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
    }

    if (!tabId) {
      throw new Error('Target tab could not be identified.');
    }

    // Check restricted URL
    if (isRestrictedUrl(url)) {
      throw new Error('Cannot capture screenshots on this page (Restricted URL).');
    }

    await CaptureQueue.updateState({
      status: 'capturing',
      mode,
      tabId,
      error: null,
      result: null
    });

    if (mode === 'visible') {
      const tab = await chrome.tabs.get(tabId);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      // Show progress indicator only when analysis starts (after capture is complete)
      await processCapturedImage(dataUrl, tabId);
    } else if (mode === 'full') {
      const tab = await chrome.tabs.get(tabId);
      const dataUrl = await captureFullPage(tab);
      // Show progress indicator only when analysis starts (after capture is complete)
      await processCapturedImage(dataUrl, tabId);
    } else if (mode === 'area') {
      // For area selection, don't show progress during selection
      // Progress will be shown after user completes area selection
      await startAreaSelection(tabId);
      return;
    }
  } catch (error) {
    console.error('[Background] processQueuedRequest error:', error);
    await CaptureQueue.updateState({ status: 'error', error: error.message });
  }
}

// Start area selection process
async function startAreaSelection(tabId) {
  try {
    // Verify tab is still valid and accessible
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (tabError) {
      throw new Error('Tab was closed. Please try again.');
    }

    // Check if URL is restricted before injecting
    if (isRestrictedUrl(tab.url)) {
      throw new Error('Cannot capture screenshots on this page (Restricted URL).');
    }

    // Update state to 'selecting' first so hideFloatingProgress check passes
    await CaptureQueue.updateState({ status: 'selecting', tabId });

    // Hide progress indicator during area selection (the overlay is the UI)
    await hideFloatingProgress(tabId);

    // Clean up any existing area selection state BEFORE injecting
    await chrome.storage.local.remove(['areaSelection']);

    // Inject CSS (always needed, safe to re-inject)
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['selector.css'] });

    // Check if AreaSelector is already available from content script
    // If not, inject selector.js (handles edge cases where content script didn't load)
    const checkResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.AreaSelector !== 'undefined'
    });

    const alreadyLoaded = checkResult && checkResult[0] && checkResult[0].result;

    if (!alreadyLoaded) {
      // Inject the selector class definition (fallback for when content script didn't load)
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['selector.js']
      });
    } else {
      // Clean up any existing instance before creating new one
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (window._areaSelector && typeof window._areaSelector.destroy === 'function') {
            try { window._areaSelector.destroy(); } catch (e) {}
          }
        }
      });
    }

    // Delay to allow popup-close synthetic events to fire and be ignored
    await new Promise(resolve => setTimeout(resolve, 350));

    // Explicitly instantiate the selector now that the class is defined.
    // selector.js intentionally does NOT auto-instantiate (it is also a
    // content script that runs on every page load), so we kick it off here —
    // only reachable when the user has clicked "Select Area".
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Destroy any stale instance before creating a fresh one
        if (window._areaSelector && typeof window._areaSelector.destroy === 'function') {
          try { window._areaSelector.destroy(); } catch (e) {}
        }
        window._areaSelector = new window.AreaSelector();
      }
    });

    // Store the tabId so we know which tab to capture when selection is done
    await chrome.storage.local.set({ activeCaptureTabId: tabId });

    console.log('[Background] Area selection initialized successfully');
  } catch (error) {
    console.error('[Background] startAreaSelection error:', error);
    // Handle various error types with user-friendly messages
    let msg = error.message;

    if (msg.includes('invalidated')) {
      msg = 'Extension was reloaded. Please refresh this page to continue.';
    } else if (msg.includes('Cannot access')) {
      msg = 'Cannot access this page. Please try a different page.';
    } else if (msg.includes('Tab was closed')) {
      msg = 'The tab was closed. Please try again.';
    }

    await CaptureQueue.updateState({ status: 'error', error: msg });
    // Release the processing lock so future captures aren't blocked
    await CaptureQueue.clear();
    pollingActive = false;
  }
}

// Handle area selection change
async function handleAreaSelectionChange(areaSelection) {
  const data = await chrome.storage.local.get('activeCaptureTabId');
  const tabId = data.activeCaptureTabId;

  if (!tabId) {
    return;
  }

  // Clear area selection state immediately
  await chrome.storage.local.remove(['areaSelection', 'activeCaptureTabId']);

  if (areaSelection === null) {
    // User cancelled - clear request and mark as cancelled
    await CaptureQueue.clear();
    pollingActive = false;
    await CaptureQueue.updateState({ status: 'cancelled' });
    return;
  }

  try {
    // Show floating progress indicator BEFORE updating state to avoid race conditions
    // This ensures the progress indicator is visible when polling detects 'processing' state
    await showFloatingProgress(tabId);
    await updateFloatingProgress(tabId, 0, 15, 'Processing', 'Preparing capture...');
    
    // Now update state to 'processing' (after progress is shown)
    await CaptureQueue.updateState({ status: 'processing', tabId });

    // Delay for overlay to clear
    await new Promise(resolve => setTimeout(resolve, 250));

    const tab = await chrome.tabs.get(tabId);

    // Check if selection is within the current visible viewport
    const [{ result: viewportInfo }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const viewportTop = window.scrollY;
        const viewportLeft = window.scrollX;
        const viewportBottom = viewportTop + window.innerHeight;
        const viewportRight = viewportLeft + window.innerWidth;

        const selBottom = sel.y + sel.height;
        const selRight = sel.x + sel.width;

        // Check if selection is entirely within the current viewport
        const isInViewport = sel.x >= viewportLeft &&
          sel.y >= viewportTop &&
          selRight <= viewportRight &&
          selBottom <= viewportBottom;

        return {
          isInViewport,
          viewportTop,
          viewportLeft,
          dpr: window.devicePixelRatio || 1
        };
      },
      args: [areaSelection]
    });

    let finalDataUrl;
    console.log('[Background] Viewport info:', viewportInfo);

    if (viewportInfo.isInViewport) {
      // Selection is within viewport - simple capture, no scrolling needed
      console.log('[Background] Capturing visible tab...');
      const visibleDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      console.log('[Background] Visible tab captured, length:', visibleDataUrl?.length);

      // Crop the captured image to the selection area (relative to viewport)
      console.log('[Background] Starting image crop...');
      const cropResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: (dataUrl, selection, viewportTop, viewportLeft, dpr) => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Selection coordinates relative to viewport
                const sx = (selection.x - viewportLeft) * dpr;
                const sy = (selection.y - viewportTop) * dpr;
                const sw = selection.width * dpr;
                const sh = selection.height * dpr;

                canvas.width = sw;
                canvas.height = sh;
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                resolve(canvas.toDataURL('image/png'));
              } catch (e) { reject(e.message); }
            };
            img.onerror = () => reject('Failed to load image');
            img.src = dataUrl;
          });
        },
        args: [visibleDataUrl, areaSelection, viewportInfo.viewportTop, viewportInfo.viewportLeft, viewportInfo.dpr]
      });

      const croppedDataUrl = cropResult?.[0]?.result;
      console.log('[Background] Crop result:', cropResult);
      console.log('[Background] Cropped data URL length:', croppedDataUrl?.length);
      if (!croppedDataUrl || !croppedDataUrl.startsWith('data:')) {
        throw new Error('Failed to crop image: invalid result');
      }
      finalDataUrl = croppedDataUrl;
    } else {
      // Selection extends beyond viewport - need multi-capture with scrolling
      const fullPageDataUrl = await captureFullPageForArea(tab, areaSelection);

      const [{ result: dpr }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.devicePixelRatio || 1
      });

      const cropResult2 = await chrome.scripting.executeScript({
        target: { tabId },
        func: (dataUrl, selection, dpr) => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const sx = selection.x * dpr;
                const sy = selection.y * dpr;
                const sw = selection.width * dpr;
                const sh = selection.height * dpr;
                canvas.width = sw;
                canvas.height = sh;
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                resolve(canvas.toDataURL('image/png'));
              } catch (e) { reject(e.message); }
            };
            img.onerror = () => reject('Failed to load image');
            img.src = dataUrl;
          });
        },
        args: [fullPageDataUrl, areaSelection, dpr]
      });

      const croppedDataUrl2 = cropResult2?.[0]?.result;
      console.log('[Background] Crop result 2:', cropResult2);
      console.log('[Background] Cropped data URL 2 length:', croppedDataUrl2?.length);
      if (!croppedDataUrl2 || !croppedDataUrl2.startsWith('data:')) {
        throw new Error('Failed to crop image: invalid result');
      }
      finalDataUrl = croppedDataUrl2;
    }

    console.log('[Background] Calling processCapturedImage with finalDataUrl length:', finalDataUrl?.length);
    await processCapturedImage(finalDataUrl, tabId);
    
    // Clear request and reset polling flag after successful completion
    await CaptureQueue.clear();
    pollingActive = false;
  } catch (error) {
    console.error('[Background] Area processing error:', error);
    console.error('[Background] Error stack:', error.stack);
    await CaptureQueue.updateState({ status: 'error', error: error.message });
    
    // Clear request and reset polling flag on error
    await CaptureQueue.clear();
    pollingActive = false;
  }
}

// Capture full page for area selection (supports scrolling)
// Helper function to capture with rate limiting and retry logic
async function captureWithRetry(tab, maxRetries = 3) {
  const CAPTURE_DELAY = 600; // Increased from 300ms to avoid rate limiting

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add delay before capture (except for first attempt)
      if (attempt > 0) {
        const backoffDelay = CAPTURE_DELAY * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else if (attempt === 0 && maxRetries > 0) {
        // Small delay for first capture too
        await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY));
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      return dataUrl;
    } catch (error) {
      if (error.message && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        if (attempt < maxRetries) {
          continue; // Retry
        }
      }
      throw error;
    }
  }
}

async function captureFullPageForArea(tab, areaSelection) {

  const [{ result: pageInfo }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (areaSel) => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const scrollWidth = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      );
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const originalScrollX = window.scrollX;
      const originalScrollY = window.scrollY;

      // Calculate the extent of the selection
      const areaBottom = areaSel.y + areaSel.height;
      const areaRight = areaSel.x + areaSel.width;

      return {
        scrollHeight,
        scrollWidth,
        viewportHeight,
        viewportWidth,
        originalScrollX,
        originalScrollY,
        areaBottom,
        areaRight
      };
    },
    args: [areaSelection]
  });

  const { scrollHeight, viewportHeight, viewportWidth, originalScrollX, originalScrollY, areaBottom, areaRight } = pageInfo;

  // Calculate the total capture area needed
  // We must capture from y=0 down to at least areaBottom
  const captureHeight = Math.max(areaBottom, scrollHeight);
  const captureWidth = viewportWidth; // Always capture full viewport width

  // Calculate how many full viewport captures we need
  const numCaptures = Math.ceil(captureHeight / viewportHeight);

  const captures = [];

  // Capture each section with rate limiting
  for (let i = 0; i < numCaptures; i++) {
    const scrollY = i * viewportHeight;

    // Show overlay during scroll, hide before capture
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y) => {
        let overlay = document.getElementById('screengrab-area-capture-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'screengrab-area-capture-overlay';
          overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2147483647;pointer-events:none;display:none;';
          document.documentElement.appendChild(overlay);
        }
        overlay.style.display = 'block';
        window.scrollTo(0, y);
      },
      args: [scrollY]
    });

    await new Promise(resolve => setTimeout(resolve, 30));

    // Hide overlay before capture and wait for repaint
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const overlay = document.getElementById('screengrab-area-capture-overlay');
        if (overlay) overlay.style.display = 'none';
        // Wait for browser repaint
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });

    // Capture with rate limiting and retry logic
    const dataUrl = await captureWithRetry(tab, 3);
    captures.push({ dataUrl, scrollY });
  }

  // Restore original scroll position and remove overlay (hidden by overlay)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (x, y) => {
      // Show overlay first to hide the scroll
      let overlay = document.getElementById('screengrab-area-capture-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screengrab-area-capture-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2147483647;pointer-events:none;display:block;';
        document.documentElement.appendChild(overlay);
      } else {
        overlay.style.display = 'block';
      }

      // Scroll while overlay is visible
      window.scrollTo(x, y);

      // Remove overlay after a brief delay to ensure scroll completes
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.remove();
        }
      }, 100);
    },
    args: [originalScrollX, originalScrollY]
  });

  // Stitch the captured images
  const [{ result: stitchedDataUrl }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (captures, totalWidth, totalHeight) => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size to the total captured area
        canvas.width = totalWidth;
        canvas.height = totalHeight;

        // Fill with white background (not transparent)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        let loaded = 0;
        let currentY = 0;

        captures.forEach((c, index) => {
          const img = new Image();
          img.onload = () => {
            // Use the actual image dimensions
            const imgHeight = img.height;
            const imgWidth = img.width;

            // Draw the full image at the current Y position
            // This ensures no gaps - each image is drawn completely
            ctx.drawImage(img, 0, currentY, imgWidth, imgHeight);

            // Update Y position for next image
            currentY += imgHeight;

            if (++loaded === captures.length) {
              resolve(canvas.toDataURL('image/png'));
            }
          };
          img.onerror = (e) => {
            console.error('[Stitch] Failed to load image section', index, ':', e);
            reject('Failed to load captured image');
          };
          img.src = c.dataUrl;
        });
      });
    },
    args: [captures, captureWidth, captureHeight]
  });

  return stitchedDataUrl;
}

// Process captured image and run AI analysis
// Show floating progress indicator
// Note: progress-indicator.js is already loaded as content script, so we just send the message
async function showFloatingProgress(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'showProgress' });
  } catch (e) {
    console.log('[Background] Could not show progress indicator:', e.message);
  }
}

// Hide floating progress indicator
async function hideFloatingProgress(tabId) {
  // Check current state - don't hide if still actively processing
  // This prevents premature hiding when service worker wakes from suspension
  // Exception: 'selecting' state allows hiding (area selection overlay is the UI)
  try {
    const state = await CaptureQueue.getState();
    if (state && ['analyzing', 'processing', 'capturing'].includes(state.status)) {
      console.log('[Background] Skipping hideFloatingProgress - still active:', state.status);
      return;
    }
  } catch (e) {
    // Ignore errors
  }
  
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'hideProgress' });
  } catch (e) {
    // Ignore errors if tab closed or script not available
  }
}

// Update floating progress indicator
async function updateFloatingProgress(tabId, step, percent, status, stats) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'updateProgress',
      step,
      percent,
      status,
      stats
    });
  } catch (e) {
    // Ignore errors if tab closed or script not available
  }
}

async function processCapturedImage(dataUrl, tabId) {
  try {
    await CaptureQueue.updateState({ status: 'analyzing' });

    // Show progress indicator when analysis starts (after capture is complete)
    await showFloatingProgress(tabId);
    await updateFloatingProgress(tabId, 0, 10, 'Analyzing', 'Initializing...');

    const settings = await CaptureQueue.getSettings();
    let base64Image = dataUrl.split(',')[1];

    if (!base64Image) throw new Error('Invalid image data');

    // Resize image if needed
    base64Image = await resizeImageIfNeeded(dataUrl, 1920);
    if (!base64Image) throw new Error('Failed to resize image');

    const result = await analyzeScreenshot(base64Image, settings, tabId, updateFloatingProgress);

    // Check if cancelled before updating state
    const state = await CaptureQueue.getState();
    if (state?.status === 'cancelled') {
      await hideFloatingProgress(tabId);
      return;
    }

    await CaptureQueue.updateState({
      status: 'complete',
      result,
      useRedirectMode: settings.useRedirectMode
    });
    await hideFloatingProgress(tabId);

    // Send message to tab to show result (for both popup and floating icon flows)
    // The result-display component is loaded as a content script on all pages
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'showResult',
        result: result
      });
    } catch (e) {
      console.warn('[Background] Could not send showResult message to tab:', e.message);
    }
  } catch (error) {
    console.error('[Background] processCapturedImage error:', error);

    // Don't hide progress on transient errors (service worker suspension/reload)
    // The polling loop in floating-icon.js will detect the error state
    // Only hide if it's a real error (not connection/context issues)
    const isTransientError = error.message && (
      error.message.includes('Extension context') ||
      error.message.includes('context invalidated') ||
      error.message.includes('Service worker') ||
      error.message.includes('Connection') ||
      error.message.includes('Network')
    );

    if (!isTransientError) {
      await CaptureQueue.updateState({ status: 'error', error: error.message });
      await hideFloatingProgress(tabId);

      // Send error message to tab to show error
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'showResult',
          result: `<div style="padding: 20px; border-left: 4px solid #ef4444; background: #fef2f2; border-radius: 4px;">
            <h2 style="color: #dc2626; margin-top: 0;">⚠️ Error</h2>
            <p style="color: #7f1d1d; font-size: 14px;">${error.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>`
        });
      } catch (e) {
        console.warn('[Background] Could not send error message to tab:', e.message);
      }
    } else {
      // For transient errors, just update state - let polling handle UI
      await CaptureQueue.updateState({ status: 'error', error: 'Analysis interrupted. Please try again.' });
    }
  }
}

// Capture full page
async function captureFullPage(tab) {
  const [{ result: pageInfo }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      viewport: window.innerHeight,
      width: window.innerWidth,
      originalScrollX: window.scrollX,
      originalScrollY: window.scrollY
    })
  });

  const { height, viewport, width, originalScrollX, originalScrollY } = pageInfo;
  const captures = [];

  const numCaptures = Math.ceil(height / viewport);

  for (let i = 0; i < numCaptures; i++) {
    const y = i * viewport;

    // Show overlay during scroll, hide before capture
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (scrollY) => {
        let overlay = document.getElementById('screengrab-fullpage-capture-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'screengrab-fullpage-capture-overlay';
          overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2147483647;pointer-events:none;display:none;';
          document.documentElement.appendChild(overlay);
        }
        overlay.style.display = 'block';
        window.scrollTo(0, scrollY);
      },
      args: [y]
    });

    await new Promise(resolve => setTimeout(resolve, 30));

    // Hide overlay before capture and wait for repaint
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const overlay = document.getElementById('screengrab-fullpage-capture-overlay');
        if (overlay) overlay.style.display = 'none';
        // Wait for browser repaint
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });

    // Use the same rate-limited capture function
    const dataUrl = await captureWithRetry(tab, 3);
    captures.push({ dataUrl, y });
  }

  // Restore scroll position (hidden by overlay) before stitching
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (x, y) => {
      // Show overlay first to hide the scroll
      let overlay = document.getElementById('screengrab-fullpage-capture-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screengrab-fullpage-capture-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2147483647;pointer-events:none;display:block;';
        document.documentElement.appendChild(overlay);
      } else {
        overlay.style.display = 'block';
      }

      // Scroll while overlay is visible
      window.scrollTo(x, y);

      // Remove overlay after a brief delay to ensure scroll completes
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.remove();
        }
      }, 100);
    },
    args: [originalScrollX, originalScrollY]
  });

  const [{ result: stitched }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (captures, width, height) => {
      return new Promise(async (resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Load and draw each capture at its stored y position
        // This avoids race conditions from async onload callbacks
        for (const capture of captures) {
          const img = await new Promise((imgResolve, imgReject) => {
            const image = new Image();
            image.onload = () => imgResolve(image);
            image.onerror = imgReject;
            image.src = capture.dataUrl;
          });

          // Use the stored y position from capture (not a counter)
          const yPos = capture.y;
          const remainingHeight = height - yPos;
          const imgHeight = Math.min(img.height, remainingHeight);

          ctx.drawImage(img, 0, yPos, width, imgHeight);
        }

        resolve(canvas.toDataURL('image/png'));
      });
    },
    args: [captures, width, height]
  });
  return stitched;
}

// parseMarkdown and sanitizeSensitiveData are now imported from utils.js

// Format result
function formatResult(description, analysis) {
  const descHtml = parseMarkdown(description);
  const analysisHtml = parseMarkdown(analysis);
  return `${descHtml}${analysisHtml}`;
}

// Message listener for pings and follow-up questions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ ready: true });
    return; // Synchronous response, don't keep channel open
  } else if (request.action === 'followUpQuestion') {
    handleFollowUpQuestion(request, sender)
      .then(response => sendResponse({ success: true, response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'cancelCapture') {
    handleCancelCapture()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'startAreaSelection') {
    // Handle area selection request from popup
    // This ensures the request is processed before popup closes
    handleStartAreaSelection(request, sender)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  return true;
});

// Handle cancel capture
async function handleCancelCapture() {
  await CaptureQueue.cancel();
  await CaptureQueue.reset();
}

// Handle start area selection (called from popup via message)
async function handleStartAreaSelection(request, sender) {
  let { tabId, url } = request;

  // If tabId is null/missing, use sender.tab.id (for floating icon) or find the active tab
  if (!tabId) {
    // Prefer sender.tab.id if available (message sent from a tab)
    if (sender.tab?.id) {
      tabId = sender.tab.id;
    } else {
      // Fallback: find active tab (for messages from popup or other contexts)
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
    }
  }
  
  if (!tabId) {
    throw new Error('Could not determine the target tab');
  }
  
  // If URL is not provided, get it from the tab
  if (!url) {
    try {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url;
    } catch (e) {
      throw new Error('Could not access tab');
    }
  }
  
  // Check restricted URL
  if (isRestrictedUrl(url)) {
    throw new Error('Cannot capture screenshots on this page (Restricted URL).');
  }
  
  // Enqueue the area selection request
  await CaptureQueue.enqueue({
    mode: 'area',
    url,
    tabId
  });
  
  // Process the request immediately
  // This ensures the area selection starts before the popup closes
  await processQueuedRequest();
}

// Handle follow-up question
async function handleFollowUpQuestion(request, sender) {
  const { question, conversationHistory } = request;
  const tabId = sender?.tab?.id;

  if (!tabId) {
    throw new Error('Could not determine the source tab');
  }

  try {
    const settings = await CaptureQueue.getSettings();
    const response = await AIService.askFollowUp(question, conversationHistory, settings);
    return response;
  } catch (error) {
    throw error;
  }
}

// Process follow-up request from storage (works when service worker is suspended)
async function processFollowUpRequest() {
  try {
    const request = await CaptureQueue.getFollowUpRequest();
    if (!request) return;

    console.log('[Background] Processing follow-up request:', request.id);

    try {
      const settings = await CaptureQueue.getSettings();
      const response = await AIService.askFollowUp(
        request.question,
        request.conversationHistory,
        settings
      );

      // Set the response in storage
      await CaptureQueue.setFollowUpResponse(response, null);

      console.log('[Background] Follow-up response sent');
    } catch (error) {
      console.error('[Background] Follow-up processing error:', error);
      // Set error response
      await CaptureQueue.setFollowUpResponse(null, error.message);
    } finally {
      // Clear the request
      await CaptureQueue.clearFollowUpRequest();
    }
  } catch (error) {
    console.error('[Background] Process follow-up request error:', error);
  }
}

// Clean up stale state on load — but NOT captureRequest, followUpRequest,
// or followUpResponse, which may be the request that just woke this service
// worker (MV3 race condition: fire-and-forget remove() can delete the
// pending request before the storage listener processes it).
chrome.storage.local.remove(['currentCapture', 'areaSelection', 'activeCaptureTabId']);
// Also clear session storage processing lock to prevent stale locks blocking first click
chrome.storage.session.remove('captureProcessingLock').catch(() => {});
