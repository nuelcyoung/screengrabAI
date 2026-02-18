let currentMode = 'visible';

// Log when popup script loads
console.log('[Popup] Popup script loaded');

// Wrapper for chrome.runtime.sendMessage with timeout and retry
async function sendMessageWithRetry(message, timeout = 5000, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Message timeout')), timeout)
        )
      ]);

      return response;

    } catch (error) {
      // If this was the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retrying with exponential backoff
      const backoffDelay = Math.min(100 * Math.pow(2, attempt), 1000);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

// Settings
let settings = {
  visionApiProvider: 'ollama',
  textApiProvider: 'ollama',
  ollamaApiKey: '',
  googleApiKey: '',
  visionModel: 'qwen3-vl:4b',
  textModel: 'qwen3-coder:480b-cloud',
  floatingIconEnabled: true
};

// Load settings on startup and initialize UI
(async function init() {
  console.log('[Popup] Initializing...');

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }

  console.log('[Popup] DOM ready');

  // Check if critical elements exist
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const loadingStep = document.getElementById('loading-step');
  const captureBtn = document.getElementById('capture');

  console.log('[Popup] Critical elements:', {
    loading: !!loading,
    loadingText: !!loadingText,
    loadingStep: !!loadingStep,
    captureBtn: !!captureBtn
  });

  if (!loading || !loadingText || !loadingStep || !captureBtn) {
    console.error('[Popup] Missing critical elements!');
  }

  await loadSettings();
  setupSettingsUI();

  console.log('[Popup] Initialization complete');
})();

// Settings functions
async function loadSettings() {
  // Load settings and API keys separately
  const stored = await chrome.storage.local.get([
    'screengrabSettings',
    'ollamaApiKey',
    'googleApiKey',
    'openaiApiKey',
    'anthropicApiKey',
    'geminiApiKey'
  ]);
  const storedSettings = stored.screengrabSettings || {};

  settings = {
    visionApiProvider: storedSettings.visionApiProvider || 'ollama',
    textApiProvider: storedSettings.textApiProvider || 'ollama',
    ollamaApiKey: stored.ollamaApiKey || '',
    googleApiKey: stored.googleApiKey || '',
    openaiApiKey: stored.openaiApiKey || '',
    anthropicApiKey: stored.anthropicApiKey || '',
    geminiApiKey: stored.geminiApiKey || '',
    visionModel: storedSettings.visionModel || 'qwen3-vl:4b',
    textModel: storedSettings.textModel || 'qwen3-coder:480b-cloud',
    floatingIconEnabled: storedSettings.floatingIconEnabled !== false
  };

}

function setupSettingsUI() {
  const settingsBtn = document.getElementById('settings-btn');

  // Open settings
  settingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });
}

// Mode button handling
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const selectedMode = btn.dataset.mode;
    currentMode = selectedMode;

    // Immediately start area selection when clicking Select Area mode
    if (selectedMode === 'area') {
      console.log('[Popup] Area mode selected, starting selection...');

      const button = document.getElementById('capture');
      const loading = document.getElementById('loading');
      const loadingStep = document.getElementById('loading-step');
      const loadingText = document.getElementById('loading-text');
      const result = document.getElementById('result');
      const resultContent = document.getElementById('result-content');

      console.log('[Popup] Elements found:', {
        button: !!button,
        loading: !!loading,
        loadingStep: !!loadingStep,
        loadingText: !!loadingText,
        result: !!result,
        resultContent: !!resultContent
      });

      button.disabled = true;
      loading.classList.add('visible');
      result.classList.remove('visible');
      resultContent.textContent = '';
      loadingText.textContent = 'Area Selection';
      loadingStep.textContent = 'Select an area on the page...';

      console.log('[Popup] Loading classes:', loading.className);
      console.log('[Popup] Loading display:', window.getComputedStyle(loading).display);

      await startAreaSelection();
    }
  });
});

// Capture button
document.getElementById('capture').addEventListener('click', async () => {
  console.log('[Popup] Capture button clicked, mode:', currentMode);

  const button = document.getElementById('capture');
  const loading = document.getElementById('loading');
  const loadingStep = document.getElementById('loading-step');
  const loadingText = document.getElementById('loading-text');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');

  console.log('[Popup] Elements found:', {
    button: !!button,
    loading: !!loading,
    loadingStep: !!loadingStep,
    loadingText: !!loadingText,
    result: !!result,
    resultContent: !!resultContent
  });

  // Don't start if already selecting area
  if (currentMode === 'area' && button.disabled) {
    console.log('[Popup] Already selecting area, returning');
    return;
  }

  button.disabled = true;
  loading.classList.add('visible');
  result.classList.remove('visible');
  resultContent.textContent = '';

  // Initialize progress at step 0
  updateProgress(0, 3, 10);

  console.log('[Popup] Loading classes:', loading.className);
  console.log('[Popup] Loading computed display:', window.getComputedStyle(loading).display);

  if (currentMode === 'area') {
    // For area selection, use background.js flow but keep popup open
    await startAreaSelection();
    return;
  }

  try {
    let screenshotData;
    const loadingText = document.getElementById('loading-text');

    if (currentMode === 'visible') {
      loadingText.textContent = 'Capturing';
      updateProgress(0, 3, 15);
      if (loadingStep) loadingStep.textContent = 'Capturing visible area...';
      // Force a UI update before async operation
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      screenshotData = await captureVisibleTab();
    } else if (currentMode === 'full') {
      loadingText.textContent = 'Capturing';
      updateProgress(0, 3, 15);
      if (loadingStep) loadingStep.textContent = 'Capturing full page...';
      // Force a UI update before async operation
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      screenshotData = await captureFullPage();
    }

    if (screenshotData) {
      loadingText.textContent = 'Analyzing';
      // Ensure loading is visible
      if (!loading.classList.contains('visible')) {
        loading.classList.add('visible');
      }
      const imageDescription = await describeImage(screenshotData);

      // Ensure loading is still visible
      if (!loading.classList.contains('visible')) {
        loading.classList.add('visible');
      }
      const deepAnalysis = await analyzeWithTextModel(imageDescription);

      resultContent.innerHTML = formatResult(imageDescription, deepAnalysis);
      result.classList.add('visible');
    }
  } catch (error) {
    resultContent.innerHTML = `<div class="error">${error.message}</div>`;
    result.classList.add('visible');
  } finally {
    button.disabled = false;
    loading.classList.remove('visible');
  }
});

// Cancel button handler
document.getElementById('cancel-capture').addEventListener('click', async () => {
  const button = document.getElementById('capture');
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');

  // Cancel via CaptureQueue (for area selection polling)
  await CaptureQueue.cancel();

  // Also try to cancel via background.js message (for active processing)
  try {
    await chrome.runtime.sendMessage({ action: 'cancelCapture' });
  } catch (e) {
    // Ignore if background not available
  }

  // Reset UI
  loading.classList.remove('visible');
  button.disabled = false;
  result.classList.remove('visible');
  resultContent.textContent = '';
});

async function startAreaSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const loadingStep = document.getElementById('loading-step');
  const loading = document.getElementById('loading');

  // Ensure loading is visible before starting async operations
  if (!loading.classList.contains('visible')) {
    loading.classList.add('visible');
  }

  // Force a render before starting the async operation
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Enqueue request via CaptureQueue (same as floating icon)
  await CaptureQueue.enqueue({
    mode: 'area',
    url: tab.url,
    tabId: tab.id
  });

  // Poll for result using same pattern as floating icon
  await pollForAreaResult(loadingStep);

  // Don't close popup - result is displayed inline like other modes
}

// Poll for area selection result (when popup is used)
async function pollForAreaResult(loadingStep) {
  console.log('[Popup] Starting pollForAreaResult');

  const maxWait = 120000; // 2 minutes for full analysis
  const pollInterval = 500;
  let elapsed = 0;

  const button = document.getElementById('capture');
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');

  console.log('[Popup] Polling elements found:', {
    button: !!button,
    loading: !!loading,
    result: !!result,
    resultContent: !!resultContent,
    loadingStep: !!loadingStep
  });

  while (elapsed < maxWait) {
    const state = await CaptureQueue.getState();

    console.log('[Popup] Poll state:', state ? `${state.status} (${elapsed}ms)` : 'null');

    if (state) {
      const loadingText = document.getElementById('loading-text');

      if (!loadingText) {
        console.error('[Popup] loading-text element not found!');
      }

      if (state.status === 'capturing') {
        console.log('[Popup] Status: capturing');
        loadingText.textContent = 'Initializing...';
        loadingStep.textContent = 'Please wait...';
      } else if (state.status === 'selecting') {
        console.log('[Popup] Status: selecting');
        loadingText.textContent = 'Area Selection';
        loadingStep.textContent = 'Select an area on the page...';
      } else if (state.status === 'processing') {
        console.log('[Popup] Status: processing');
        loadingText.textContent = 'Processing';
        loadingStep.textContent = 'Processing captured area...';
      } else if (state.status === 'analyzing') {
        console.log('[Popup] Status: analyzing');
        loadingText.textContent = 'Analyzing';
        loadingStep.textContent = 'AI Analysis in progress...';
      } else if (state.status === 'complete' && state.result) {
        console.log('[Popup] Status: complete');
        // Show result in popup (same as visible/full page modes)
        resultContent.innerHTML = state.result;
        result.classList.add('visible');
        loading.classList.remove('visible');
        button.disabled = false;
        await CaptureQueue.reset();
        return;
      } else if (state.status === 'error') {
        console.error('[Popup] Error:', state.error);
        resultContent.innerHTML = `<div class="error">${state.error}</div>`;
        result.classList.add('visible');
        loading.classList.remove('visible');
        button.disabled = false;
        await CaptureQueue.reset();
        return;
      } else if (state.status === 'cancelled') {
        console.log('[Popup] Status: cancelled');
        loading.classList.remove('visible');
        button.disabled = false;
        await CaptureQueue.reset();
        return;
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  console.log('[Popup] Polling timed out');
  resultContent.innerHTML = `<div class="error">Operation timed out. Please try again.</div>`;
  result.classList.add('visible');
  loading.classList.remove('visible');
  button.disabled = false;
  await CaptureQueue.reset();
}

// Show result on-page using result-display component
async function showResultOnPage(tabId, resultHtml) {
  try {
    // Inject result display CSS and JS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['result-display.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['result-display.js']
    });

    // Create and show result display on the page
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (html) => {
        if (window._screengrabResultDisplay) {
          window._screengrabResultDisplay.destroy();
        }
        window._screengrabResultDisplay = new window.ResultDisplay();
        window._screengrabResultDisplay.showResult(html);
      },
      args: [resultHtml]
    });

  } catch (error) {
    // Failed to show result on-page
  }
}

function formatResult(description, analysis) {
  const descHtml = parseMarkdown(description);
  const analysisHtml = parseMarkdown(analysis);
  return `${descHtml}${analysisHtml}`;
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

  // Tables
  html = html.replace(/\|(.+)\|/g, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    return '<tr>' + cells.map(c => `<td>${c || ''}</td>`).join('') + '</tr>';
  });

  // Wrap tables
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, (match) => {
    return '<table>' + match + '</table>';
  });

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

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
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');

  return html;
}

// Health sector privacy: Sanitize and protect sensitive data
// Optional privacy feature: Sanitize sensitive data patterns
function sanitizeSensitiveData(data) {
  if (typeof data === 'string') {
    // Only redact obvious SSN patterns
    data = data.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  }
  return data;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function captureVisibleTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return dataUrl.split(',')[1];
}

async function captureFullPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Get page dimensions
  const [{ result: pageInfo }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const originalScrollX = window.scrollX;
      const originalScrollY = window.scrollY;
      return { scrollHeight, viewportHeight, viewportWidth, originalScrollX, originalScrollY };
    }
  });

  const { scrollHeight, viewportHeight, viewportWidth, originalScrollX, originalScrollY } = pageInfo;
  const captures = [];
  const numCaptures = Math.ceil(scrollHeight / viewportHeight);

  for (let i = 0; i < numCaptures; i++) {
    const scrollY = Math.min(i * viewportHeight, scrollHeight - viewportHeight);

    // Hide page content during scroll (show overlay)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y) => {
        // Create/show overlay if not exists
        let overlay = document.getElementById('screengrab-capture-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'screengrab-capture-overlay';
          overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2147483647;pointer-events:none;display:none;';
          document.documentElement.appendChild(overlay);
        }
        overlay.style.display = 'block';
        window.scrollTo(0, y);
      },
      args: [scrollY]
    });

    await new Promise(resolve => setTimeout(resolve, 30));

    // Hide overlay and wait for repaint before capture
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const overlay = document.getElementById('screengrab-capture-overlay');
        if (overlay) overlay.style.display = 'none';
        // Wait for browser repaint
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    captures.push({ dataUrl, y: scrollY });
  }

  // Restore scroll and remove overlay (hidden by overlay)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (x, y) => {
      // Show overlay first to hide the scroll
      let overlay = document.getElementById('screengrab-capture-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screengrab-capture-overlay';
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

  const stitchedDataUrl = await stitchImages(captures, viewportWidth, scrollHeight, viewportHeight);
  return stitchedDataUrl.split(',')[1];
}

async function stitchImages(captures, width, totalHeight, viewportHeight) {
  // Process locally using canvas - no messaging needed
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas dimensions
  canvas.width = width;
  canvas.height = totalHeight;

  // Load and draw each capture
  for (const capture of captures) {
    const img = await loadImage(capture.dataUrl);
    const yPos = capture.y;

    // Calculate how much of this capture to use
    const remainingHeight = totalHeight - yPos;
    const captureHeight = Math.min(viewportHeight, remainingHeight);

    ctx.drawImage(
      img,
      0, 0, img.width, captureHeight * (img.width / width),  // Source
      0, yPos, width, captureHeight                           // Destination
    );
  }

  return canvas.toDataURL('image/png');
}

// Helper to load image from data URL
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function cropImage(dataUrl, selection, devicePixelRatio) {
  // Process locally using canvas - no messaging needed
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Scale selection by device pixel ratio
  const scaledSelection = {
    x: selection.x * devicePixelRatio,
    y: selection.y * devicePixelRatio,
    width: selection.width * devicePixelRatio,
    height: selection.height * devicePixelRatio
  };

  // Set canvas to cropped size
  canvas.width = scaledSelection.width;
  canvas.height = scaledSelection.height;

  // Draw the cropped portion
  ctx.drawImage(
    img,
    scaledSelection.x, scaledSelection.y, scaledSelection.width, scaledSelection.height,
    0, 0, scaledSelection.width, scaledSelection.height
  );

  return canvas.toDataURL('image/png');
}

// Progress management functions
function updateProgress(step, totalSteps, percent) {
  const progressBar = document.getElementById('progress-bar');
  const loadingStep = document.getElementById('loading-step');
  const loadingStats = document.getElementById('loading-stats');

  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }

  // Update step dots
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`step-${i}`);
    const line = document.getElementById(`line-${i}`);

    if (dot) {
      dot.classList.remove('active', 'completed');
      if (i < step) {
        dot.classList.add('completed');
      } else if (i === step) {
        dot.classList.add('active');
      }
    }

    if (line) {
      line.classList.remove('completed');
      if (i < step) {
        line.classList.add('completed');
      }
    }
  }

  return { loadingStep, loadingStats };
}

async function describeImage(base64Image) {
  const { loadingStep, loadingStats } = updateProgress(1, 3, 33);

  // Resize image if too large (max 1920px on longest side)
  const resizedImage = await resizeImageIfNeeded(base64Image, 1920);

  try {
    const result = await AIService.describeImage(resizedImage, settings, (chunk, totalChars) => {
      if (loadingStep) {
        loadingStep.textContent = 'Vision Analysis';
      }
      if (loadingStats) {
        loadingStats.textContent = `${totalChars.toLocaleString()} chars processed`;
      }
    });
    return result;
  } catch (error) {
    throw error;
  }
}

async function resizeImageIfNeeded(base64Image, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;

      // Check if resize needed
      if (width <= maxSize && height <= maxSize) {
        resolve(base64Image);
        return;
      }

      // Calculate new dimensions
      const ratio = Math.min(maxSize / width, maxSize / height);
      const newWidth = Math.round(width * ratio);
      const newHeight = Math.round(height * ratio);

      // Resize using canvas
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Return resized base64 (without data:image/png;base64, prefix)
      const resized = canvas.toDataURL('image/png').split(',')[1];
      resolve(resized);
    };
    img.src = 'data:image/png;base64,' + base64Image;
  });
}

async function analyzeWithTextModel(imageDescription) {
  const { loadingStep, loadingStats } = updateProgress(2, 3, 66);

  try {
    const result = await AIService.analyzeText(imageDescription, settings, (chunk, totalChars) => {
      if (loadingStep) {
        loadingStep.textContent = 'Deep Analysis';
      }
      if (loadingStats) {
        loadingStats.textContent = `${totalChars.toLocaleString()} chars processed`;
      }
    });

    // Mark as complete
    updateProgress(3, 3, 100);

    return result;
  } catch (error) {
    throw error;
  }
}

// Cleanup when popup closes to cancel any in-progress captures
window.addEventListener('beforeunload', () => {
  // Clear any pending capture states
  chrome.storage.local.remove([
    'currentCapture',
    'captureRequest',
    'areaSelection',
    'activeCaptureTabId'
  ]).catch(() => {
    // Ignore errors during cleanup
  });
});
