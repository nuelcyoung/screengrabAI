/**
 * Capture Queue - Storage-based communication layer
 * 
 * Eliminates "Could not establish connection" errors by using
 * chrome.storage.local instead of runtime messaging.
 * Storage is always available, even when service workers sleep.
 */

const CaptureQueue = {
    KEYS: {
        REQUEST: 'captureRequest',
        STATE: 'currentCapture',
        SETTINGS: 'screengrabSettings'
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
     */
    async dequeue() {
        const data = await chrome.storage.local.get(this.KEYS.REQUEST);
        const request = data[this.KEYS.REQUEST];

        if (request && request.status === 'pending') {
            // Mark as processing to prevent double-processing
            request.status = 'processing';
            await chrome.storage.local.set({ [this.KEYS.REQUEST]: request });
            return request;
        }

        return null;
    },

    /**
     * Clear the current request
     */
    async clear() {
        await chrome.storage.local.remove(this.KEYS.REQUEST);
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
     * Reset state (clear everything)
     */
    async reset() {
        await chrome.storage.local.remove([this.KEYS.REQUEST, this.KEYS.STATE]);
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
            'anthropicApiKey',
            'geminiApiKey'
        ]);
        const settings = data[this.KEYS.SETTINGS] || {};
        return {
            ...settings,
            ollamaApiKey: data.ollamaApiKey || '',
            googleApiKey: data.googleApiKey || '',
            openaiApiKey: data.openaiApiKey || '',
            anthropicApiKey: data.anthropicApiKey || '',
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
    }
};

// Export for different contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptureQueue;
}
