// Floating Progress Indicator for AI Processing
// Shows on the page when popup is closed (especially during area selection)

(function() {
  'use strict';

  // Generate random IDs to avoid conflicts
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const CONTAINER_ID = 'sg_progress_' + randomSuffix;
  const PROGRESS_BAR_ID = 'sg_progress_bar_' + randomSuffix;
  const STATUS_TEXT_ID = 'sg_status_text_' + randomSuffix;
  const STEP_TEXT_ID = 'sg_step_text_' + randomSuffix;
  const STATS_TEXT_ID = 'sg_stats_text_' + randomSuffix;
  const CANCEL_BTN_ID = 'sg_cancel_btn_' + randomSuffix;

  let container = null;
  let isVisible = false;

  // Create the progress indicator
  function createProgressIndicator() {
    if (container) return;

    // Remove any existing progress indicators
    document.querySelectorAll('[id^="sg_progress_"]').forEach(el => el.remove());

    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'sg-progress-indicator';
    container.innerHTML = `
      <div class="sg-progress-header">
        <div class="sg-progress-spinner"></div>
        <div class="sg-progress-title" id="${STATUS_TEXT_ID}">Analyzing...</div>
      </div>
      <div class="sg-progress-bar-container">
        <div class="sg-progress-bar" id="${PROGRESS_BAR_ID}" style="width: 0%"></div>
      </div>
      <div class="sg-progress-steps">
        <div class="sg-step-dot" id="${CONTAINER_ID}_step1"></div>
        <div class="sg-step-line" id="${CONTAINER_ID}_line1"></div>
        <div class="sg-step-dot" id="${CONTAINER_ID}_step2"></div>
        <div class="sg-step-line" id="${CONTAINER_ID}_line2"></div>
        <div class="sg-step-dot" id="${CONTAINER_ID}_step3"></div>
      </div>
      <div class="sg-progress-status" id="${STEP_TEXT_ID}">Initializing...</div>
      <div class="sg-progress-stats" id="${STATS_TEXT_ID}"></div>
      <button class="sg-progress-cancel" id="${CANCEL_BTN_ID}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancel
      </button>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
      .sg-progress-indicator {
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        width: 320px !important;
        padding: 20px !important;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%) !important;
        border: 2px solid rgba(139, 92, 246, 0.5) !important;
        border-radius: 16px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.1) !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif !important;
        color: #e4e4e7 !important;
        opacity: 0 !important;
        transform: translateY(20px) !important;
        transition: opacity 0.3s ease, transform 0.3s ease !important;
        pointer-events: auto !important;
      }

      .sg-progress-indicator.visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }

      .sg-progress-header {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin-bottom: 16px !important;
      }

      .sg-progress-spinner {
        width: 24px !important;
        height: 24px !important;
        border: 3px solid rgba(139, 92, 246, 0.2) !important;
        border-top-color: #8b5cf6 !important;
        border-radius: 50% !important;
        animation: sg-spin 1s linear infinite !important;
        flex-shrink: 0 !important;
      }

      @keyframes sg-spin {
        to { transform: rotate(360deg); }
      }

      .sg-progress-title {
        font-size: 15px !important;
        font-weight: 600 !important;
        color: #fff !important;
      }

      .sg-progress-bar-container {
        width: 100% !important;
        height: 6px !important;
        background: rgba(139, 92, 246, 0.2) !important;
        border-radius: 3px !important;
        overflow: hidden !important;
        margin-bottom: 16px !important;
      }

      .sg-progress-bar {
        height: 100% !important;
        background: linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%) !important;
        border-radius: 3px !important;
        transition: width 0.3s ease !important;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.5) !important;
      }

      .sg-progress-steps {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
      }

      .sg-step-dot {
        width: 10px !important;
        height: 10px !important;
        border-radius: 50% !important;
        background: rgba(139, 92, 246, 0.3) !important;
        transition: all 0.3s ease !important;
      }

      .sg-step-dot.active {
        background: #8b5cf6 !important;
        box-shadow: 0 0 12px rgba(139, 92, 246, 0.8) !important;
        transform: scale(1.3) !important;
      }

      .sg-step-dot.completed {
        background: #22c55e !important;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.5) !important;
      }

      .sg-step-line {
        width: 30px !important;
        height: 2px !important;
        background: rgba(139, 92, 246, 0.3) !important;
        transition: all 0.3s ease !important;
      }

      .sg-step-line.completed {
        background: #22c55e !important;
      }

      .sg-progress-status {
        font-size: 13px !important;
        color: #a78bfa !important;
        text-align: center !important;
        margin-bottom: 6px !important;
        min-height: 18px !important;
      }

      .sg-progress-stats {
        font-size: 11px !important;
        color: #8b5cf6 !important;
        text-align: center !important;
        min-height: 16px !important;
        margin-bottom: 12px !important;
      }

      .sg-progress-cancel {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        width: 100% !important;
        padding: 10px !important;
        background: rgba(239, 68, 68, 0.15) !important;
        border: 1px solid rgba(239, 68, 68, 0.4) !important;
        color: #fca5a5 !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        transition: all 0.2s ease !important;
      }

      .sg-progress-cancel:hover {
        background: rgba(239, 68, 68, 0.25) !important;
        border-color: rgba(239, 68, 68, 0.6) !important;
      }

      .sg-progress-cancel svg {
        flex-shrink: 0 !important;
      }

      /* Animation for completion */
      .sg-progress-indicator.complete .sg-progress-spinner {
        border-color: #22c55e !important;
        border-top-color: #22c55e !important;
        animation: none !important;
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(container);

    // Add cancel button handler
    const cancelBtn = container.querySelector(`#${CANCEL_BTN_ID}`);
    cancelBtn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'cancelCapture' });
      } catch (e) {
        // Ignore if background not available
      }
      hideProgress();
    });
  }

  // Show the progress indicator
  function showProgress() {
    createProgressIndicator();
    if (container) {
      container.classList.add('visible');
      isVisible = true;
      // Reset state
      updateProgress(0, 0);
    }
  }

  // Hide the progress indicator
  function hideProgress() {
    if (container) {
      container.classList.remove('visible');
      isVisible = false;
      // Remove after animation
      setTimeout(() => {
        if (container && !isVisible) {
          container.remove();
          container = null;
        }
      }, 300);
    }
  }

  // Update progress
  function updateProgress(step, percent, statusText, statsText) {
    if (!container) return;

    // Update progress bar
    const progressBar = container.querySelector(`#${PROGRESS_BAR_ID}`);
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }

    // Update status text
    const statusEl = container.querySelector(`#${STATUS_TEXT_ID}`);
    if (statusEl && statusText) {
      statusEl.textContent = statusText;
    }

    // Update step text
    const stepEl = container.querySelector(`#${STEP_TEXT_ID}`);
    if (stepEl) {
      const steps = ['Initializing...', 'Vision Analysis', 'Deep Analysis', 'Complete'];
      stepEl.textContent = steps[step] || steps[0];
    }

    // Update stats text
    const statsEl = container.querySelector(`#${STATS_TEXT_ID}`);
    if (statsEl && statsText) {
      statsEl.textContent = statsText;
    }

    // Update step dots
    for (let i = 1; i <= 3; i++) {
      const dot = container.querySelector(`#${CONTAINER_ID}_step${i}`);
      const line = container.querySelector(`#${CONTAINER_ID}_line${i}`);

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
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showProgress') {
      showProgress();
      sendResponse({ success: true });
    } else if (message.action === 'hideProgress') {
      hideProgress();
      sendResponse({ success: true });
    } else if (message.action === 'updateProgress') {
      updateProgress(
        message.step || 0,
        message.percent || 0,
        message.status,
        message.stats
      );
      sendResponse({ success: true });
    }
    return true;
  });

  // Expose to window for manual testing
  window.SGProgressIndicator = {
    show: showProgress,
    hide: hideProgress,
    update: updateProgress
  };
})();
