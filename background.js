// Background service worker for handling captures
// Health sector compliance: Secure data handling and privacy protection

// Import AIService for centralized API calls
importScripts('ai-service.js');
// Import CaptureQueue for storage-based communication
importScripts('capture-queue.js');

let pollingActive = false;

// Optional privacy feature: Sanitize sensitive data patterns
function sanitizeSensitiveData(data) {
  if (typeof data === 'string') {
    // Only redact obvious SSN patterns
    data = data.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  }
  return data;
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

// Listen for storage changes to handle capture requests and area selections
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // Handle new capture requests
  if (changes.captureRequest && changes.captureRequest.newValue) {
    processQueuedRequest();
  }

  // Handle area selection completion
  if (changes.areaSelection && changes.areaSelection.newValue !== undefined) {
    handleAreaSelectionChange(changes.areaSelection.newValue);
  }

  // Reset polling flag when capture completes, errors, or is cancelled
  // This ensures new captures can start immediately
  if (changes.currentCapture && changes.currentCapture.newValue) {
    const status = changes.currentCapture.newValue.status;
    if (status === 'complete' || status === 'error' || status === 'cancelled') {
      pollingActive = false;
    }
  }
});

// Process queued request (called from storage listener)
async function processQueuedRequest() {
  if (pollingActive) return;

  try {
    const request = await CaptureQueue.dequeue();
    if (!request) return;

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
      await processCapturedImage(dataUrl, tabId);
    } else if (mode === 'full') {
      const tab = await chrome.tabs.get(tabId);
      const dataUrl = await captureFullPage(tab);
      await processCapturedImage(dataUrl, tabId);
    } else if (mode === 'area') {
      await startAreaSelection(tabId);
    }
  } catch (error) {
    console.error('[Background] processQueuedRequest error:', error);
    await CaptureQueue.updateState({ status: 'error', error: error.message });
  } finally {
    pollingActive = false;
    await CaptureQueue.clear();
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

    // Inject selector resources
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['selector.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['selector.js'] });

    // Wait for script to execute and AreaSelector to be available
    // Increased delay to ensure overlay is fully ready to receive clicks
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clean up any existing area selection state
    await chrome.storage.local.remove(['areaSelection']);

    // Initialize selector
    const [{ result: initResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof window.AreaSelector === 'function') {
          try {
            if (window._areaSelector && typeof window._areaSelector.destroy === 'function') {
              window._areaSelector.destroy();
            }
            window._areaSelector = new window.AreaSelector();
            // Wait a bit for the DOM to be fully updated
            return new Promise(resolve => {
              setTimeout(() => {
                // Check if overlay exists and is ready
                const overlay = document.querySelector('[id^="sg_overlay_"]');
                const isReady = overlay && overlay.dataset.sgReady === 'true';
                resolve({ success: true, ready: isReady });
              }, 100);
            });
          } catch (e) {
            return { success: false, error: e.message };
          }
        } else {
          return { success: false, error: 'AreaSelector class not found' };
        }
      }
    });

    if (!initResult || !initResult.success) {
      throw new Error(initResult?.error || 'Failed to initialize area selector');
    }

    // Verify the selector is ready
    if (!initResult.ready) {
      throw new Error('Area selector overlay is not ready');
    }

    // Store the tabId so we know which tab to capture when selection is done
    await chrome.storage.local.set({ activeCaptureTabId: tabId });

    // Only update status to 'selecting' AFTER selector is fully initialized
    // This ensures the overlay is ready when the popup shows the message
    await CaptureQueue.updateState({ status: 'selecting', tabId });
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
  }
}

// Handle area selection change
async function handleAreaSelectionChange(areaSelection) {
  const data = await chrome.storage.local.get('activeCaptureTabId');
  const tabId = data.activeCaptureTabId;

  if (!tabId) return;

  // Clear immediately
  await chrome.storage.local.remove(['areaSelection', 'activeCaptureTabId']);

  if (areaSelection === null) {
    await CaptureQueue.updateState({ status: 'cancelled' });
    return;
  }

  try {
    await CaptureQueue.updateState({ status: 'processing' });

    // Show floating progress indicator immediately after selection
    await showFloatingProgress(tabId);
    await updateFloatingProgress(tabId, 0, 15, 'Processing', 'Preparing capture...');

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

    if (viewportInfo.isInViewport) {
      // Selection is within viewport - simple capture, no scrolling needed
      const visibleDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      // Crop the captured image to the selection area (relative to viewport)
      const [{ result: croppedDataUrl }] = await chrome.scripting.executeScript({
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

      finalDataUrl = croppedDataUrl;
    } else {
      // Selection extends beyond viewport - need multi-capture with scrolling
      const fullPageDataUrl = await captureFullPageForArea(tab, areaSelection);

      const [{ result: dpr }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.devicePixelRatio || 1
      });

      const [{ result: croppedDataUrl }] = await chrome.scripting.executeScript({
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

      finalDataUrl = croppedDataUrl;
    }

    await processCapturedImage(finalDataUrl, tabId);
  } catch (error) {
    console.error('[Background] Area processing error:', error);
    await CaptureQueue.updateState({ status: 'error', error: error.message });
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
// Inject and show floating progress indicator
async function showFloatingProgress(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['progress-indicator.js']
    });
    // Give it time to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    await chrome.tabs.sendMessage(tabId, { action: 'showProgress' });
  } catch (e) {
    console.log('[Background] Could not show progress indicator:', e.message);
  }
}

// Hide floating progress indicator
async function hideFloatingProgress(tabId) {
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

    // Show floating progress indicator
    await showFloatingProgress(tabId);
    await updateFloatingProgress(tabId, 0, 10, 'Analyzing', 'Initializing...');

    const settings = await CaptureQueue.getSettings();
    const base64Image = dataUrl.split(',')[1];

    if (!base64Image) throw new Error('Invalid image data');

    const result = await analyzeScreenshot(base64Image, settings, tabId);

    // Check if cancelled before updating state
    const state = await CaptureQueue.getState();
    if (state?.status === 'cancelled') {
      await hideFloatingProgress(tabId);
      return;
    }

    await CaptureQueue.updateState({ status: 'complete', result });
    await hideFloatingProgress(tabId);
    await CaptureQueue.safeTabMessage(tabId, { action: 'showResult', result });
  } catch (error) {
    await CaptureQueue.updateState({ status: 'error', error: error.message });
    await hideFloatingProgress(tabId);
  }
}

// Analyze screenshot using AI
async function analyzeScreenshot(base64Image, settings, tabId) {
  if (!settings.visionApiProvider || !settings.textApiProvider) {
    throw new Error('API providers not configured.');
  }

  // Vision OCR
  let imageDescription;
  try {
    await updateFloatingProgress(tabId, 1, 33, 'Analyzing', 'Vision Analysis');
    imageDescription = await AIService.describeImage(base64Image, settings, (chunk, totalChars) => {
      updateFloatingProgress(tabId, 1, 33 + (totalChars / 1000) * 10, 'Analyzing', `${totalChars.toLocaleString()} chars`);
    });
  } catch (visionError) {
    throw new Error(`Vision analysis failed: ${visionError.message}`);
  }

  imageDescription = sanitizeSensitiveData(imageDescription);

  // Check if cancelled before text analysis
  const state = await CaptureQueue.getState();
  if (state?.status === 'cancelled') {
    throw new Error('Capture cancelled');
  }

  // Text Analysis
  let deepAnalysis;
  try {
    await updateFloatingProgress(tabId, 2, 66, 'Analyzing', 'Deep Analysis');
    deepAnalysis = await AIService.analyzeText(imageDescription, settings, (chunk, totalChars) => {
      updateFloatingProgress(tabId, 2, 66 + (totalChars / 1000) * 15, 'Analyzing', `${totalChars.toLocaleString()} chars`);
    });
    deepAnalysis = sanitizeSensitiveData(deepAnalysis);
  } catch (error) {
    deepAnalysis = `Analysis unavailable: ${error.message}`;
  }

  return formatResult(imageDescription, deepAnalysis);
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
      return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        let loaded = 0;
        let currentY = 0;

        captures.forEach((c) => {
          const img = new Image();
          img.onload = () => {
            // Use actual image dimensions
            const imgHeight = img.height;
            const imgWidth = img.width;

            // Draw at the current Y position
            ctx.drawImage(img, 0, currentY, imgWidth, imgHeight);

            // Update Y position for next image
            currentY += imgHeight;

            if (++loaded === captures.length) {
              // Overlay is already removed by scroll restoration
              resolve(canvas.toDataURL('image/png'));
            }
          };
          img.onerror = () => {
            // Continue anyway to avoid hanging
            if (++loaded === captures.length) {
              // Overlay is already removed by scroll restoration
              resolve(canvas.toDataURL('image/png'));
            }
          };
          img.src = c.dataUrl;
        });
      });
    },
    args: [captures, width, height]
  });
  return stitched;
}

// Parse markdown to HTML
function parseMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Escape HTML first, but preserve markdown
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (must be before other processing)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');

  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Tables
  html = html.replace(/\|(.+)\|/g, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    return '<tr>' + cells.map(c => `<td>${c || ''}</td>`).join('') + '</tr>';
  });

  // Wrap tables
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, (match) => {
    // Check if it's a separator row (only dashes, colons, pipes)
    const rows = match.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    if (rows.length > 0) {
      // Check if first row is a separator
      const firstRowText = rows[0].replace(/<[^>]+>/g, '').replace(/[\-:|]/g, '');
      if (firstRowText.trim().length === 0) {
        // This is a separator row, skip it
        return rows.slice(1).join('');
      }
    }
    return '<table>' + match + '</table>';
  });

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/^\*\*\*+$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Only wrap with ol if not already wrapped by ul (basic check)
  html = html.replace(/(<li>(?:(?!<\/ul>).)*<\/li>\n?)+/g, (match) => {
    if (!match.includes('<ul>')) {
      return '<ol>' + match + '</ol>';
    }
    return match;
  });

  // Line breaks (preserve them)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraphs
  html = '<div>' + html + '</div>';

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr>)/g, '$1');
  html = html.replace(/(<hr>)\s*<\/p>/g, '$1');

  return html;
}

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
  }
  return true;
});

// Handle cancel capture
async function handleCancelCapture() {
  await CaptureQueue.cancel();
  await CaptureQueue.reset();
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

// Clean up stale state on load
chrome.storage.local.remove(['captureRequest', 'currentCapture', 'areaSelection', 'activeCaptureTabId']);
