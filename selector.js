// Area Selector - IIFE ensures fresh execution on each injection
(function () {
  'use strict';

  // Generate fresh unique IDs every time to avoid conflicts
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const OVERLAY_ID = 'sg_overlay_' + randomSuffix;
  const SELECTION_BOX_ID = 'sg_selection_' + randomSuffix;
  const INSTRUCTIONS_ID = 'sg_instr_' + randomSuffix;

  // Clean up any existing selector elements (from previous injections)
  document.querySelectorAll('.sg-overlay, .sg-selection-box, .sg-instructions').forEach(el => el.remove());

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
      this.destroyed = false;
      this.docStartX = 0;
      this.docStartY = 0;
      this.docCurrentX = 0;
      this.docCurrentY = 0;

      // Bind event handlers to preserve 'this' context
      this.mousedownHandler = this.handleMouseDown.bind(this);
      this.mousemoveHandler = this.handleMouseMove.bind(this);
      this.mouseupHandler = this.handleMouseUp.bind(this);
      this.keydownHandler = this.handleKeyDown.bind(this);
      this.scrollHandler = this.handleScroll.bind(this);

      this.init();
    }

    init() {
      // Create overlay with critical inline styles to ensure it works
      this.overlay = document.createElement('div');
      this.overlay.id = OVERLAY_ID;
      this.overlay.className = 'sg-overlay';
      // Force critical styles inline to override any page CSS
      this.overlay.style.cssText = 'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;background:rgba(0,0,0,0.4)!important;z-index:2147483647!important;cursor:crosshair!important;pointer-events:all!important;visibility:visible!important;display:block!important;';
      document.body.appendChild(this.overlay);

      // Create selection box
      this.selectionBox = document.createElement('div');
      this.selectionBox.id = SELECTION_BOX_ID;
      this.selectionBox.className = 'sg-selection-box';
      this.selectionBox.style.cssText = 'position:fixed!important;border:2px solid #8b5cf6!important;background:rgba(139,92,246,0.1)!important;z-index:2147483648!important;pointer-events:none!important;opacity:0;transition:opacity 0.15s ease!important;box-shadow:0 0 0 9999px rgba(0,0,0,0.5)!important;visibility:visible!important;display:block!important;';
      document.body.appendChild(this.selectionBox);

      // Create instructions
      this.instructions = document.createElement('div');
      this.instructions.id = INSTRUCTIONS_ID;
      this.instructions.className = 'sg-instructions';
      this.instructions.innerHTML = '<strong>Click and drag to select area</strong> • ESC to cancel';
      this.instructions.style.cssText = 'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;background:rgba(26,26,46,0.95)!important;color:#e4e4e7!important;padding:16px 24px!important;border-radius:12px!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:14px!important;font-weight:500!important;z-index:2147483649!important;pointer-events:none!important;box-shadow:0 8px 32px rgba(0,0,0,0.3)!important;border:1px solid rgba(139,92,246,0.3)!important;transition:opacity 0.15s ease!important;text-align:center!important;max-width:400px!important;visibility:visible!important;display:block!important;';
      document.body.appendChild(this.instructions);

      // Setup event listeners - use capture phase for more reliable event handling
      this.overlay.addEventListener('mousedown', this.mousedownHandler, true);
      document.addEventListener('mousemove', this.mousemoveHandler, true);
      document.addEventListener('mouseup', this.mouseupHandler, true);
      document.addEventListener('keydown', this.keydownHandler, true);
      window.addEventListener('scroll', this.scrollHandler, true);

      // Ensure overlay is on top - force override any page styles
      this.overlay.style.setProperty('pointer-events', 'all', 'important');

      // Mark as ready for background script to check
      this.ready = true;
      this.overlay.dataset.sgReady = 'true';

      // Listen for cleanup signals (e.g., popup closed)
      this.storageListener = (changes, areaName) => {
        if (areaName !== 'local') return;
        // If activeCaptureTabId is removed, cancel the selection
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
    }

    handleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();

      this.isSelecting = true;
      this.docStartX = e.pageX;
      this.docStartY = e.pageY;
      this.docCurrentX = e.pageX;
      this.docCurrentY = e.pageY;

      // Show selection box by setting opacity inline
      this.selectionBox.style.setProperty('opacity', '1', 'important');
      this.selectionBox.classList.add('sg-active');
      this.updateSelectionBoxDisplay();
      this.instructions.style.opacity = '0';
    }

    handleMouseMove(e) {
      if (!this.isSelecting) return;
      this.docCurrentX = e.pageX;
      this.docCurrentY = e.pageY;
      this.updateSelectionBoxDisplay();
    }

    handleMouseUp(e) {
      if (!this.isSelecting) return;
      this.isSelecting = false;

      const left = Math.min(this.docStartX, this.docCurrentX);
      const top = Math.min(this.docStartY, this.docCurrentY);
      const width = Math.abs(this.docCurrentX - this.docStartX);
      const height = Math.abs(this.docCurrentY - this.docStartY);

      this.destroy();

      if (width > 10 && height > 10) {
        chrome.storage.local.set({
          areaSelection: { x: left, y: top, width: width, height: height }
        });
      } else {
        chrome.storage.local.set({ areaSelection: null });
      }
    }

    handleKeyDown(e) {
      if (e.key === 'Escape') {
        this.destroy();
        chrome.storage.local.set({ areaSelection: null });
      }
    }

    handleScroll() {
      if (this.isSelecting) {
        this.updateSelectionBoxDisplay();
      }
    }

    updateSelectionBoxDisplay() {
      const docLeft = Math.min(this.docStartX, this.docCurrentX);
      const docTop = Math.min(this.docStartY, this.docCurrentY);
      const width = Math.abs(this.docCurrentX - this.docStartX);
      const height = Math.abs(this.docCurrentY - this.docStartY);

      const viewportLeft = docLeft - window.scrollX;
      const viewportTop = docTop - window.scrollY;

      // Use setProperty with 'important' to override inline styles
      this.selectionBox.style.setProperty('left', viewportLeft + 'px', 'important');
      this.selectionBox.style.setProperty('top', viewportTop + 'px', 'important');
      this.selectionBox.style.setProperty('width', width + 'px', 'important');
      this.selectionBox.style.setProperty('height', height + 'px', 'important');
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;

      // Remove event listeners (must match the capture phase used in init)
      if (this.overlay) {
        this.overlay.removeEventListener('mousedown', this.mousedownHandler, true);
      }
      document.removeEventListener('mousemove', this.mousemoveHandler, true);
      document.removeEventListener('mouseup', this.mouseupHandler, true);
      document.removeEventListener('keydown', this.keydownHandler, true);
      window.removeEventListener('scroll', this.scrollHandler, true);
      window.removeEventListener('beforeunload', this.unloadHandler);

      // Remove storage listener
      if (this.storageListener) {
        chrome.storage.onChanged.removeListener(this.storageListener);
        this.storageListener = null;
      }

      // Remove elements with fade out
      [this.overlay, this.selectionBox, this.instructions].forEach(el => {
        if (el && el.parentNode) {
          el.style.opacity = '0';
          setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
          }, 150);
        }
      });

      window._areaSelector = null;
    }
  }

  // Expose the class globally
  window.AreaSelector = AreaSelector;
})();
