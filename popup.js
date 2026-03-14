let currentMode = 'visible';

// Log when popup script loads
console.log('[Popup] Popup script loaded');

// Wrapper for chrome.runtime.sendMessage with timeout and retry
// Settings
let settings = {
  visionApiProvider: 'ollama',
  textApiProvider: 'ollama',
  ollamaApiKey: '',
  googleApiKey: '',
  openaiApiKey: '',
  grokApiKey: '',
  geminiApiKey: '',
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
    'grokApiKey',
    'geminiApiKey'
  ]);
  const storedSettings = stored.screengrabSettings || {};

  settings = {
    visionApiProvider: storedSettings.visionApiProvider || 'ollama',
    textApiProvider: storedSettings.textApiProvider || 'ollama',
    ollamaApiKey: stored.ollamaApiKey || '',
    googleApiKey: stored.googleApiKey || '',
    openaiApiKey: stored.openaiApiKey || '',
    grokApiKey: stored.grokApiKey || '',
    geminiApiKey: stored.geminiApiKey || '',
    visionModel: storedSettings.visionModel || 'qwen3-vl:4b',
    textModel: storedSettings.textModel || 'qwen3-coder:480b-cloud',
    floatingIconEnabled: storedSettings.floatingIconEnabled !== false,
    useRedirectMode: storedSettings.useRedirectMode || false,
    // Unified multimodal model settings (for single-step analysis)
    useUnifiedModel: storedSettings.useUnifiedModel || false,
    unifiedApiProvider: storedSettings.unifiedApiProvider || '',
    unifiedModel: storedSettings.unifiedModel || '',
    // Capture goal/prompt
    captureGoal: storedSettings.captureGoal || ''
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
    // Then close the popup so it doesn't interfere with the selection
    if (selectedMode === 'area') {
      console.log('[Popup] Area mode selected, starting selection...');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Enqueue the area selection request
      await CaptureQueue.enqueue({
        mode: 'area',
        url: tab.url,
        tabId: tab.id
      });

      // Close the popup immediately so it doesn't capture mouse events
      window.close();

      // The background.js will handle the rest and show the floating progress
      return;
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

  // Use CaptureQueue for ALL capture modes (consistent with floating icon)
  // This ensures:
  // - Single source of truth for capture logic (background.js)
  // - Popup can close safely during analysis
  // - Proper error handling and state management
  await startCapture(currentMode);
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

// Start capture using CaptureQueue (works for all modes: visible, full, area)
async function startCapture(mode) {
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
    mode: mode,
    url: tab.url,
    tabId: tab.id
  });

  // Poll for result using same pattern as floating icon
  await pollForCaptureResult(loadingStep);
}

// Poll for capture result (when popup is used)
async function pollForCaptureResult(loadingStep) {
  console.log('[Popup] Starting pollForCaptureResult');

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
        loadingText.textContent = 'Capturing...';
        loadingStep.textContent = 'Capturing screenshot...';
      } else if (state.status === 'selecting') {
        console.log('[Popup] Status: selecting');
        loadingText.textContent = 'Area Selection';
        loadingStep.textContent = 'Select an area on the page...';
      } else if (state.status === 'processing') {
        console.log('[Popup] Status: processing');
        loadingText.textContent = 'Processing';
        loadingStep.textContent = 'Processing screenshot...';
      } else if (state.status === 'analyzing') {
        console.log('[Popup] Status: analyzing');
        loadingText.textContent = 'Analyzing';
        loadingStep.textContent = 'AI Analysis in progress...';
      } else if (state.status === 'complete' && state.result) {
        console.log('[Popup] Status: complete');
        // Show result in popup
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

  // Timeout
  console.error('[Popup] Poll timeout');
  resultContent.innerHTML = '<div class="error">Capture timed out. Please try again.</div>';
  result.classList.add('visible');
  loading.classList.remove('visible');
  button.disabled = false;
  await CaptureQueue.reset();
}

// parseMarkdown, escapeHtml, and sanitizeSensitiveData are now imported from utils.js
function formatResult(description, analysis) {
  const descHtml = parseMarkdown(description);
  const analysisHtml = parseMarkdown(analysis);
  return `${descHtml}${analysisHtml}`;
}

// Helper to load image from data URL (used by cropImage for area selection)
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function cropImage(dataUrl, selection, devicePixelRatio) {
  // Process locally using canvas - used by area selection
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

// Cleanup when popup closes
// IMPORTANT: Do NOT clear captureRequest/currentCapture if they're in active use
// Only clear them if the capture is still pending (not yet started by background.js)
window.addEventListener('beforeunload', () => {
  // Check if there's an active capture before clearing
  chrome.storage.local.get(['captureRequest', 'currentCapture'], (data) => {
    const request = data.captureRequest;
    const state = data.currentCapture;

    // Only clear if:
    // - No request exists, OR
    // - Request is still pending (not yet picked up by background.js)
    const shouldClear = !request ||
      (request.status === 'pending' && (!state || state.status === 'pending'));

    if (shouldClear) {
      // Safe to clear - no active capture in progress
      chrome.storage.local.remove([
        'currentCapture',
        'captureRequest',
        'areaSelection',
        'activeCaptureTabId'
      ]).catch(() => {
        // Ignore errors during cleanup
      });
    }
    // If capture is in progress (processing/selecting/analyzing), DON'T clear
    // Let background.js handle completion/error
  });
});
