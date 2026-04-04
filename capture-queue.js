/**
 * Capture Queue - Storage-based communication layer
 * 
 * Eliminates "Could not establish connection" errors by using
 * chrome.storage.local instead of runtime messaging.
 * Storage is always available, even when service workers sleep.
 */

const CaptureQueue = {
    // Maximum age (ms) for a processing lock before it's considered stale.
    // Content scripts cannot clear chrome.storage.session, so stale locks
    // would otherwise block all future captures permanently.
    LOCK_TTL: 30000,

    KEYS: {
        REQUEST: 'captureRequest',
        STATE: 'currentCapture',
        SETTINGS: 'screengrabSettings',
        FOLLOW_UP_REQUEST: 'followUpRequest',
        FOLLOW_UP_RESPONSE: 'followUpResponse',
        PROCESSING_LOCK: 'captureProcessingLock'  // Prevents race conditions
    },

    /**
     * Enqueue a capture request (called by popup/floating-icon)
     */
    async enqueue(request) {
        const enrichedRequest = {
            ...request,
            id: `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            status: 'pending'
        };

        await chrome.storage.local.set({ [this.KEYS.REQUEST]: enrichedRequest });

        return enrichedRequest.id;
    },

    /**
     * Dequeue a capture request (called by background.js)
     *
     * Uses chrome.storage.session for a processing lock to prevent race conditions
     * when storage listeners fire multiple times in quick succession.
     *
     * The lock persists across service worker restarts, solving the issue where
     * pollingActive flag gets reset on worker suspension.
     */
    async dequeue() {
        // Check if we're already processing a request using session storage lock
        try {
            const lockData = await chrome.storage.session.get(this.KEYS.PROCESSING_LOCK);
            const lock = lockData[this.KEYS.PROCESSING_LOCK];
            if (lock) {
                // Check if lock is still within TTL
                if (lock.timestamp && (Date.now() - lock.timestamp < this.LOCK_TTL)) {
                    return null; // Valid lock, still processing
                }
                // Stale lock — clear it and proceed
                console.warn('[CaptureQueue] Clearing stale processing lock (age:', Date.now() - (lock.timestamp || 0), 'ms)');
                await chrome.storage.session.remove(this.KEYS.PROCESSING_LOCK);
            }
        } catch (e) {
            console.warn('[CaptureQueue] Could not check processing lock:', e);
        }

        const data = await chrome.storage.local.get(this.KEYS.REQUEST);
        const request = data[this.KEYS.REQUEST];

        if (request && request.status === 'pending') {
            // Set the processing lock BEFORE updating the request status
            try {
                await chrome.storage.session.set({
                    [this.KEYS.PROCESSING_LOCK]: {
                        requestId: request.id,
                        timestamp: Date.now()
                    }
                });
            } catch (e) {
                console.warn('[CaptureQueue] Could not set processing lock:', e);
            }

            // Mark as processing to prevent double-processing
            request.status = 'processing';
            await chrome.storage.local.set({ [this.KEYS.REQUEST]: request });
            return request;
        }

        return null;
    },

    /**
     * Clear the current request and processing lock
     */
    async clear() {
        await chrome.storage.local.remove(this.KEYS.REQUEST);
        // Also clear the processing lock
        try {
            await chrome.storage.session.remove(this.KEYS.PROCESSING_LOCK);
        } catch (e) {
            // Ignore errors if session.storage unavailable
        }
    },

    /**
     * Update capture state (called by background.js)
     */
    async updateState(state) {
        const currentData = await chrome.storage.local.get(this.KEYS.STATE);
        const current = currentData[this.KEYS.STATE] || {};

        const newState = {
            ...current,
            ...state,
            updatedAt: Date.now()
        };

        await chrome.storage.local.set({ [this.KEYS.STATE]: newState });
    },

    /**
     * Get current capture state (called by popup/floating-icon for polling)
     */
    async getState() {
        const data = await chrome.storage.local.get(this.KEYS.STATE);
        return data[this.KEYS.STATE] || null;
    },

    /**
     * Reset state (clear everything including processing lock)
     */
    async reset() {
        await chrome.storage.local.remove([this.KEYS.REQUEST, this.KEYS.STATE]);
        // Also clear the processing lock
        try {
            await chrome.storage.session.remove(this.KEYS.PROCESSING_LOCK);
        } catch (e) {
            // Ignore errors if session.storage unavailable
        }
    },

    /**
     * Cancel the current capture
     */
    async cancel() {
        await this.updateState({ status: 'cancelled' });
    },

    /**
     * Get settings (merged with separately stored API keys)
     */
    async getSettings() {
        const data = await chrome.storage.local.get([
            this.KEYS.SETTINGS,
            'ollamaApiKey',
            'googleApiKey',
            'openaiApiKey',
            'geminiApiKey'
        ]);
        const settings = data[this.KEYS.SETTINGS] || {};
        return {
            ...settings,
            ollamaApiKey: data.ollamaApiKey || '',
            googleApiKey: data.googleApiKey || '',
            openaiApiKey: data.openaiApiKey || '',
            geminiApiKey: data.geminiApiKey || ''
        };
    },

    /**
     * Safe message sender - never throws on connection errors
     */
    async safeTabMessage(tabId, message) {
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
            return null;
        }
    },

    /**
     * Safe runtime message sender - never throws on connection errors
     */
    async safeRuntimeMessage(message) {
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            return null;
        }
    },

    /**
     * Request a follow-up question (storage-based, works even when service worker is suspended)
     */
    async requestFollowUp(question, conversationHistory) {
        const requestId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await chrome.storage.local.set({
            [this.KEYS.FOLLOW_UP_REQUEST]: {
                id: requestId,
                question: question,
                conversationHistory: conversationHistory,
                timestamp: Date.now(),
                status: 'pending'
            }
        });

        // Clear any previous response
        await chrome.storage.local.remove(this.KEYS.FOLLOW_UP_RESPONSE);

        return requestId;
    },

    /**
     * Get follow-up request (called by background.js)
     */
    async getFollowUpRequest() {
        const data = await chrome.storage.local.get(this.KEYS.FOLLOW_UP_REQUEST);
        const request = data[this.KEYS.FOLLOW_UP_REQUEST];

        if (request && request.status === 'pending') {
            // Mark as processing
            request.status = 'processing';
            await chrome.storage.local.set({ [this.KEYS.FOLLOW_UP_REQUEST]: request });
            return request;
        }

        return null;
    },

    /**
     * Clear follow-up request
     */
    async clearFollowUpRequest() {
        await chrome.storage.local.remove(this.KEYS.FOLLOW_UP_REQUEST);
    },

    /**
     * Set follow-up response (called by background.js)
     */
    async setFollowUpResponse(response, error = null) {
        await chrome.storage.local.set({
            [this.KEYS.FOLLOW_UP_RESPONSE]: {
                response: response,
                error: error,
                timestamp: Date.now()
            }
        });
    },

    /**
     * Get follow-up response (called by floating-icon.js)
     */
    async getFollowUpResponse() {
        const data = await chrome.storage.local.get(this.KEYS.FOLLOW_UP_RESPONSE);
        return data[this.KEYS.FOLLOW_UP_RESPONSE] || null;
    },

    /**
     * Clear follow-up response
     */
    async clearFollowUpResponse() {
        await chrome.storage.local.remove(this.KEYS.FOLLOW_UP_RESPONSE);
    }
};

// Export for different contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptureQueue;
}

// Also export to window for browser/content script context
if (typeof window !== 'undefined') {
    window.CaptureQueue = CaptureQueue;
}
