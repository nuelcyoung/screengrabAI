let currentMode = 'visible';

// Log when popup script loads
console.log('[Popup] Popup script loaded');

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

  // Check if critical elements exist
  const captureBtn = document.getElementById('capture');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');

  console.log('[Popup] Critical elements:', {
    captureBtn: !!captureBtn,
    result: !!result,
    resultContent: !!resultContent
  });

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

      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        // Send message to background to start area selection
        // Wait for response to ensure it started before closing popup
        chrome.runtime.sendMessage({
          action: 'startAreaSelection',
          tabId: tab.id,
          url: tab.url
        }, (response) => {
          // Close popup after background confirms (or after delay if no response)
          setTimeout(() => {
            window.close();
          }, 50);
        });
      });

      // The background.js will handle the rest and show the floating progress
      return;
    }
  });
});

// Capture button
document.getElementById('capture').addEventListener('click', async () => {
  console.log('[Popup] Capture button clicked, mode:', currentMode);

  const button = document.getElementById('capture');
  const result = document.getElementById('result');
  const resultContent = document.getElementById('result-content');

  console.log('[Popup] Elements found:', {
    button: !!button,
    result: !!result,
    resultContent: !!resultContent
  });

  // Don't start if already selecting area
  if (currentMode === 'area' && button.disabled) {
    console.log('[Popup] Already selecting area, returning');
    return;
  }

  button.disabled = true;
  button.textContent = 'Starting...';
  result.classList.remove('visible');
  resultContent.textContent = '';

  // For area selection, close popup immediately after starting
  // For other modes, close popup and let floating progress indicator show progress
  await startCapture(currentMode);
  
  // Close popup after a short delay to ensure capture started
  setTimeout(() => {
    window.close();
  }, 100);
});

// Cancel button handler - removed, cancellation now done via floating progress indicator

// Start capture using CaptureQueue (works for all modes: visible, full, area)
async function startCapture(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Enqueue request via CaptureQueue (same as floating icon)
  await CaptureQueue.enqueue({
    mode: mode,
    url: tab.url,
    tabId: tab.id
  });

  // Note: We don't poll for results in the popup anymore
  // The floating progress indicator handles progress display on the page
  // The result will be shown in the page via result-display component
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

// Cleanup when popup closes - minimal cleanup since floating indicator handles everything
window.addEventListener('beforeunload', () => {
  // Just close the popup - the floating progress indicator and background.js handle everything else
});
