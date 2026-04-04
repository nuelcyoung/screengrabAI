// Area Selector - Direct DOM Approach (No Iframe)
//
// Simpler approach without iframe coordinate translation issues
//
(function () {
  'use strict';

  // Generate fresh unique IDs every time to avoid conflicts
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const OVERLAY_ID = 'sg_overlay_' + randomSuffix;
  const SELECTION_BOX_ID = 'sg_selection_' + randomSuffix;
  const INSTRUCTIONS_ID = 'sg_instr_' + randomSuffix;

  // Clean up any existing selector elements
  document.querySelectorAll('[id^="sg_overlay_"], [id^="sg_selection_"], [id^="sg_instr_"]').forEach(el => el.remove());

  // Destroy any existing selector instance
  if (window._areaSelector && typeof window._areaSelector.destroy === 'function') {
    try {
      window._areaSelector.destroy();
    } catch (e) { }
  }

  class AreaSelector {
    constructor() {
      this.isSelecting = false;
      this.overlay = null;
      this.selectionBox = null;
      this.instructions = null;
      this.dimensionsTooltip = null;
      this.destroyed = false;

      // Coordinate space: DOCUMENT/PAGE space
      this.startX = 0;
      this.startY = 0;
      this.currentX = 0;
      this.currentY = 0;

      // Bind event handlers
      this.pointerdownHandler = this.handlePointerDown.bind(this);
      this.pointermoveHandler = this.handlePointerMove.bind(this);
      this.pointerupHandler = this.handlePointerUp.bind(this);
      this.keydownHandler = this.handleKeyDown.bind(this);
      this.scrollHandler = this.handleScroll.bind(this);

      this.init();
    }

    init() {
      // Create overlay container
      this.overlay = document.createElement('div');
      this.overlay.id = OVERLAY_ID;
      this.overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.3) !important;
        z-index: 2147483647 !important;
        cursor: crosshair !important;
        pointer-events: all !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
      `;
      document.body.appendChild(this.overlay);

      // Create selection box
      this.selectionBox = document.createElement('div');
      this.selectionBox.id = SELECTION_BOX_ID;
      this.selectionBox.style.cssText = `
        position: absolute !important;
        border: 2px solid #8b5cf6 !important;
        background: rgba(139, 92, 246, 0.1) !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
        display: none !important;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5) !important;
      `;
      this.overlay.appendChild(this.selectionBox);

      // Create dimensions tooltip
      this.dimensionsTooltip = document.createElement('div');
      this.dimensionsTooltip.style.cssText = `
        position: absolute !important;
        bottom: -30px !important;
        left: 0 !important;
        background: rgba(26, 26, 46, 0.95) !important;
        color: #e4e4e7 !important;
        padding: 4px 10px !important;
        border-radius: 6px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        border: 1px solid rgba(139, 92, 246, 0.3) !important;
      `;
      this.selectionBox.appendChild(this.dimensionsTooltip);

      // Create instructions
      this.instructions = document.createElement('div');
      this.instructions.id = INSTRUCTIONS_ID;
      this.instructions.style.cssText = `
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: rgba(26, 26, 46, 0.98) !important;
        color: #e4e4e7 !important;
        padding: 20px 28px !important;
        border-radius: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        z-index: 2147483648 !important;
        pointer-events: none !important;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.3) !important;
        border: 1px solid rgba(139, 92, 246, 0.4) !important;
        text-align: center !important;
        max-width: 420px !important;
        backdrop-filter: blur(8px) !important;
      `;
      this.instructions.innerHTML = '<strong>Click and drag to select area</strong><br><span style="opacity:0.7;font-size:13px;margin-top:8px;display:block;">Press <kbd style="display:inline-block;padding:3px 8px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);border-radius:4px;font-family:\'Consolas\',\'Monaco\',monospace;font-size:12px;color:#a78bfa;margin:0 2px;">ESC</kbd> to cancel</span>';
      this.overlay.appendChild(this.instructions);

      // Setup event listeners
      this.overlay.addEventListener('mousedown', this.pointerdownHandler, true);
      document.addEventListener('mousemove', this.pointermoveHandler, true);
      document.addEventListener('mouseup', this.pointerupHandler, true);
      document.addEventListener('keydown', this.keydownHandler, true);
      window.addEventListener('scroll', this.scrollHandler, true);

      // Listen for cleanup signals
      this.storageListener = (changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.activeCaptureTabId && changes.activeCaptureTabId.newValue === undefined) {
          this.destroy();
        }
      };
      chrome.storage.onChanged.addListener(this.storageListener);

      // Cleanup on page unload
      this.unloadHandler = () => {
        this.destroy();
      };
      window.addEventListener('beforeunload', this.unloadHandler);

      // Ignore clicks for the first 100ms to prevent accidental selections
      this._ignorePointerDownUntil = performance.now() + 100;
    }

    handlePointerDown(e) {
      if (performance.now() < this._ignorePointerDownUntil) return;
      if (e.button !== 0) return;
      // Check if click is on overlay or any of its children (selection box, etc.)
      // Use composedPath to handle shadow DOM events properly
      const path = e.composedPath ? e.composedPath() : [e.target];
      const clickedOnOverlay = path.some(el => el === this.overlay);
      if (!clickedOnOverlay) return;

      e.preventDefault();
      e.stopPropagation();

      this.isSelecting = true;

      // Store starting position in viewport coordinates
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.currentX = e.clientX;
      this.currentY = e.clientY;

      // Show selection box
      this.selectionBox.style.setProperty('display', 'block', 'important');
      this.updateSelectionBox();

      // Hide instructions
      this.instructions.style.opacity = '0';
      this.instructions.style.transform = 'translate(-50%, -50%) scale(0.95)';
    }

    handlePointerMove(e) {
      if (!this.isSelecting) return;

      e.preventDefault();
      e.stopPropagation();

      // Update current position
      this.currentX = e.clientX;
      this.currentY = e.clientY;

      this.updateSelectionBox();
    }

    handlePointerUp(e) {
      if (!this.isSelecting) return;

      e.preventDefault();
      e.stopPropagation();

      this.isSelecting = false;

      // Calculate selection in viewport coordinates
      const viewportLeft = Math.min(this.startX, this.currentX);
      const viewportTop = Math.min(this.startY, this.currentY);
      const width = Math.abs(this.currentX - this.startX);
      const height = Math.abs(this.currentY - this.startY);

      // Convert to document coordinates (account for scroll)
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      const docLeft = viewportLeft + scrollX;
      const docTop = viewportTop + scrollY;

      // Check minimum selection size
      const meetsMinimumSize = width > 10 && height > 10;

      // Destroy overlay
      this.destroy();

      // Store selection result
      const selectionData = meetsMinimumSize
        ? { x: docLeft, y: docTop, width: width, height: height }
        : null;

      chrome.storage.local.set({ areaSelection: selectionData }, () => {
        if (chrome.runtime.lastError) {
          console.error('[AreaSelector] Failed to store area selection:', chrome.runtime.lastError);
        }
      });
    }

    handleKeyDown(e) {
      if (e.key === 'Escape') {
        this.destroy();

        chrome.storage.local.set({ areaSelection: null }, () => {
          if (chrome.runtime.lastError) {
            console.error('[AreaSelector] Failed to cancel area selection:', chrome.runtime.lastError);
          }
        });
      }
    }

    handleScroll() {
      if (this.isSelecting) {
        // Cancel selection on scroll to avoid coordinate confusion
        this.destroy();
        chrome.storage.local.set({ areaSelection: null });
      }
    }

    updateSelectionBox() {
      // Calculate selection box in viewport coordinates
      const left = Math.min(this.startX, this.currentX);
      const top = Math.min(this.startY, this.currentY);
      const width = Math.abs(this.currentX - this.startX);
      const height = Math.abs(this.currentY - this.startY);

      // Update selection box (viewport coordinates)
      this.selectionBox.style.setProperty('left', left + 'px', 'important');
      this.selectionBox.style.setProperty('top', top + 'px', 'important');
      this.selectionBox.style.setProperty('width', width + 'px', 'important');
      this.selectionBox.style.setProperty('height', height + 'px', 'important');

      // Update dimensions tooltip
      if (this.dimensionsTooltip) {
        this.dimensionsTooltip.textContent = `${Math.round(width)} × ${Math.round(height)}`;
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;

      // Remove event listeners
      if (this.overlay) {
        this.overlay.removeEventListener('mousedown', this.pointerdownHandler, true);
      }
      document.removeEventListener('mousemove', this.pointermoveHandler, true);
      document.removeEventListener('mouseup', this.pointerupHandler, true);
      document.removeEventListener('keydown', this.keydownHandler, true);
      window.removeEventListener('scroll', this.scrollHandler, true);
      window.removeEventListener('beforeunload', this.unloadHandler);

      // Remove storage listener
      if (this.storageListener) {
        chrome.storage.onChanged.removeListener(this.storageListener);
        this.storageListener = null;
      }

      // Remove overlay (which contains everything)
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.style.opacity = '0';
        this.overlay.style.transition = 'opacity 0.2s ease';
        setTimeout(() => {
          if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
          }
        }, 200);
      }

      // Clear reference
      window._areaSelector = null;
    }
  }

  // Export the class globally so background.js can instantiate it on demand
  // Do NOT auto-instantiate here — selector.js is a content script that runs
  // on every page load.  The AreaSelector should only be created when the user
  // explicitly clicks "Select Area".
  window.AreaSelector = AreaSelector;
})();
