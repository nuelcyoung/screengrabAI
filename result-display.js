// Import utility functions from utils.js (loaded as content script before this file)
// generateRandomId, parseMarkdown, escapeHtml are available globally

class ResultDisplay {
  constructor() {
    // Generate random IDs for stealth
    this.PANEL_ID = generateRandomId('sg_panel');
    this.BACKDROP_ID = generateRandomId('sg_backdrop');
    this.HEADER_ID = generateRandomId('sg_header');
    this.TITLE_ID = generateRandomId('sg_title');
    this.ACTIONS_ID = generateRandomId('sg_actions');
    this.COPY_BTN_ID = generateRandomId('sg_copy');
    this.CLOSE_BTN_ID = generateRandomId('sg_close');
    this.CONTENT_ID = generateRandomId('sg_content');
    this.FOLLOWUP_ID = generateRandomId('sg_followup');
    this.INPUT_ID = generateRandomId('sg_input');
    this.SUBMIT_ID = generateRandomId('sg_submit');

    this.panel = null;
    this.backdrop = null;
    this.content = null;
    this.followUpInput = null;
    this.followUpSubmit = null;
    this.onCloseCallback = null;
    this.onFollowUpCallback = null;
    this.conversationHistory = [];
    this.init();
  }

  setOnClose(callback) {
    this.onCloseCallback = callback;
  }

  setOnFollowUp(callback) {
    this.onFollowUpCallback = callback;
  }

  setConversationHistory(history) {
    this.conversationHistory = history || [];
  }

  init() {
    // Remove any existing panel/backdrop
    const existingPanel = document.getElementById(this.PANEL_ID);
    const existingBackdrop = document.getElementById(this.BACKDROP_ID);
    if (existingPanel) existingPanel.remove();
    if (existingBackdrop) existingBackdrop.remove();

    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.id = this.BACKDROP_ID;
    this.backdrop.className = 'sg-backdrop';
    document.body.appendChild(this.backdrop);

    // Create panel
    this.panel = document.createElement('div');
    this.panel.id = this.PANEL_ID;
    this.panel.className = 'sg-panel';
    this.panel.innerHTML = `
      <div id="${this.HEADER_ID}" class="sg-header">
        <div id="${this.TITLE_ID}" class="sg-title">
          <img src="${chrome.runtime.getURL('icon48.png')}" alt="ScreenGrab" class="sg-logo" onerror="this.style.display='none'; console.error('Failed to load icon48.png')" />
          <span>Analysis Result</span>
        </div>
        <div id="${this.ACTIONS_ID}" class="sg-actions">
          <button id="${this.COPY_BTN_ID}" class="sg-copy" title="Copy to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button id="${this.CLOSE_BTN_ID}" class="sg-close">&times;</button>
        </div>
      </div>
      <div id="${this.CONTENT_ID}" class="sg-content"></div>
      <div id="${this.FOLLOWUP_ID}" class="sg-followup">
        <div class="followup-input-wrapper">
          <input type="text" id="${this.INPUT_ID}" class="sg-input" placeholder="Ask a follow-up question..." />
          <button id="${this.SUBMIT_ID}" class="sg-submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.content = document.getElementById(this.CONTENT_ID);
    this.followUpInput = document.getElementById(this.INPUT_ID);
    this.followUpSubmit = document.getElementById(this.SUBMIT_ID);

    // Setup copy button
    const copyBtn = document.getElementById(this.COPY_BTN_ID);
    copyBtn.addEventListener('click', () => this.copyToClipboard());

    // Setup close button
    const closeBtn = document.getElementById(this.CLOSE_BTN_ID);
    closeBtn.addEventListener('click', () => {
      this.destroy();
    });

    // Setup follow-up input handlers
    this.followUpSubmit.addEventListener('click', () => this.submitFollowUp());
    this.followUpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.submitFollowUp();
      }
    });

    // Close on backdrop click
    this.backdrop.addEventListener('click', () => {
      this.destroy();
    });

    // Close on Escape key
    this.keydownHandler = (e) => {
      if (e.key === 'Escape' && this.panel.classList.contains('sg-visible')) {
        this.destroy();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  showResult(html) {
    // Check if the display has been destroyed
    if (!this.panel || !this.backdrop || !this.content) {
      console.error('[ResultDisplay] Cannot show result: display has been destroyed or not initialized');
      return;
    }

    this.content.innerHTML = html;

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.backdrop && this.panel) {
        this.backdrop.classList.add('sg-visible');
        this.panel.classList.add('sg-visible');
      }
    });
  }

  async copyToClipboard() {
    const text = this.content.textContent;
    try {
      await navigator.clipboard.writeText(text);

      // Show feedback
      const copyBtn = document.getElementById(this.COPY_BTN_ID);
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>`;
      copyBtn.style.color = '#4ade80';

      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.style.color = '';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  submitFollowUp() {
    const question = this.followUpInput.value.trim();
    if (!question) return;

    if (!this.onFollowUpCallback) {
      console.error('[ResultDisplay] Follow-up callback not registered');
      this.appendMessage('user', question);
      this.appendMessage('assistant', 'Error: Follow-up functionality not available. Please try capturing a new screenshot.');
      this.followUpInput.value = '';
      return;
    }

    // Disable input during processing
    this.followUpInput.disabled = true;
    this.followUpSubmit.disabled = true;

    // Add question to content
    this.appendMessage('user', question);
    this.followUpInput.value = '';

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: question });

    // Call the callback with the question, history, and a reference to this instance
    this.onFollowUpCallback(question, this.conversationHistory, this);
  }

  appendMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `screengrab-message screengrab-message-${role}`;

    const label = role === 'user' ? 'You' : 'AI';

    // SECURITY: Prevent XSS attacks
    // - For 'user' role: Escape content (plain text input from user)
    // - For 'assistant' role: Content is already HTML from parseMarkdown (which escapes HTML)
    // - We only escape user input; AI responses are pre-processed by parseMarkdown
    const safeContent = role === 'user' ? escapeHtml(content) : content;

    messageDiv.innerHTML = `
      <div class="screengrab-message-label">${label}</div>
      <div class="screengrab-message-content">${safeContent}</div>
    `;

    this.content.appendChild(messageDiv);

    // Scroll to bottom
    this.content.scrollTop = this.content.scrollHeight;
  }

  appendFollowUpResponse(response) {
    // Parse markdown and add response to content
    const htmlResponse = parseMarkdown(response);
    this.appendMessage('assistant', htmlResponse);

    // Store original markdown in conversation history
    this.conversationHistory.push({ role: 'assistant', content: response });

    // Re-enable input
    this.followUpInput.disabled = false;
    this.followUpSubmit.disabled = false;
    this.followUpInput.focus();
  }

  setFollowUpLoading(loading) {
    if (loading) {
      this.followUpInput.disabled = true;
      this.followUpSubmit.disabled = true;
      this.followUpSubmit.innerHTML = `<svg class="spinner" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" fill="none">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
        </path>
      </svg>`;
    } else {
      this.followUpInput.disabled = false;
      this.followUpSubmit.disabled = false;
      this.followUpSubmit.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>`;
    }
  }

  destroy() {
    // IMPORTANT: Always call the cleanup callback to ensure state is disposed
    // This must happen regardless of DOM state
    if (this.onCloseCallback) {
      this.onCloseCallback();
      this.onCloseCallback = null; // Prevent double-calling
    }

    // Clear the global reference immediately to prevent race conditions
    if (window.__sg_current_result_display === this) {
      window.__sg_current_result_display = null;
    }

    // Guard against double-destroy
    if (!this.panel) {
      return;  // Already destroyed
    }

    // Save references before clearing them
    const panel = this.panel;
    const backdrop = this.backdrop;

    // Clear IMMEDIATELY to prevent race conditions with double-destroy calls
    this.panel = null;
    this.backdrop = null;
    this.content = null;
    this.followUpInput = null;
    this.followUpSubmit = null;

    // Remove from DOM with animation
    if (panel && panel.parentNode) {
      panel.classList.remove('sg-visible');
      if (backdrop) backdrop.classList.remove('sg-visible');

      setTimeout(() => {
        if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
        if (backdrop && backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
      }, 400);
    }

    // Clean up follow-up related state
    this.followUpInput = null;
    this.followUpSubmit = null;
    this.conversationHistory = [];
    this.onFollowUpCallback = null;

    document.removeEventListener('keydown', this.keydownHandler);
  }
}

// Use a less detectable property name
const SG_RESULT_DISPLAY_KEY = '__sg_result_display_' + Math.random().toString(36).substr(2, 9);
window[SG_RESULT_DISPLAY_KEY] = ResultDisplay;
// Also expose as window.ResultDisplay for compatibility
window.ResultDisplay = ResultDisplay;

// Flag to signal that result has been shown (used by floating-icon.js polling)
window.__sg_resultShown = false;

// Follow-up question handler
async function handleFollowUpQuestion(question, conversationHistory, displayInstance) {
  const resultDisplay = displayInstance || window.__sg_current_result_display;

  try {
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(true);
    }

    // Use CaptureQueue to send follow-up question
    await CaptureQueue.requestFollowUp(question, conversationHistory);

    // Poll for response
    await pollForFollowUpResponse(resultDisplay);

  } catch (error) {
    if (resultDisplay) {
      resultDisplay.setFollowUpLoading(false);
      resultDisplay.appendFollowUpResponse(`Error: ${error.message}`);
    }
  }
}

// Poll for follow-up response
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

// Listen for showResult messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showResult') {
    // Hide any existing result display
    if (window.__sg_current_result_display) {
      window.__sg_current_result_display.destroy();
    }

    // Create new result display
    window.__sg_current_result_display = new ResultDisplay();

    // Register cleanup callback
    window.__sg_current_result_display.setOnClose(() => {
      // Clear storage state when modal is closed
      chrome.storage.local.remove([
        'currentCapture',
        'captureRequest',
        'areaSelection',
        'activeCaptureTabId'
      ]).catch(() => {});

      // Ensure floating icon is visible
      const floatBtn = document.querySelector('[id^="sg_float_btn"]');
      if (floatBtn) floatBtn.style.display = '';
    });

    // Register follow-up callback
    window.__sg_current_result_display.setOnFollowUp(handleFollowUpQuestion);

    // Parse result to conversation history
    const conversationHistory = parseResultToConversation(message.result);
    window.__sg_current_result_display.setConversationHistory(conversationHistory);

    // Show the result
    window.__sg_current_result_display.showResult(message.result);

    // Signal that result has been shown (for floating-icon.js polling)
    window.__sg_resultShown = true;

    sendResponse({ success: true });
    return true; // Keep channel open for async response
  }
  return true;
});

// Parse result HTML to conversation history format
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