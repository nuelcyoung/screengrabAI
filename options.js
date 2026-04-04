// Settings state
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
    floatingIconEnabled: true,
    useRedirectMode: false,
    // Unified multimodal model settings (for single-step analysis)
    useUnifiedModel: false,
    unifiedApiProvider: '',
    unifiedModel: '',
    // Capture goal/prompt
    captureGoal: ''
};

// Initialize UI
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    initNavigation();
    setupUI();

    // Initial fetch of models
    fetchAndPopulateModels('vision', settings.visionApiProvider);
    fetchAndPopulateModels('text', settings.textApiProvider);
});

async function loadSettings() {
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

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.dataset.section;

            // Update nav
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');

            // Update sections
            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === targetSection) {
                    sec.classList.add('active');
                }
            });
        });
    });
}

function setupUI() {
    // Provider information for display
    const providerInfo = {
        'ollama': { name: 'Ollama (Local)', desc: 'Vision provider optimized for your hardware', needsKey: false },
        'ollama-cloud': { name: 'Ollama (Cloud)', desc: 'Cloud-hosted Ollama models', needsKey: true, keyName: 'ollamaApiKey', keyUrl: 'https://ollama.com' },
        'openai': { name: 'OpenAI', desc: 'High-performance cloud LLM for analysis', needsKey: true, keyName: 'openaiApiKey', keyUrl: 'https://platform.openai.com/api-keys' },
        'grok': { name: 'Grok', desc: 'xAI\'s advanced reasoning model', needsKey: true, keyName: 'grokApiKey', keyUrl: 'https://console.x.ai' },
        'google-gemini': { name: 'Google Gemini', desc: 'Google\'s multimodal AI model', needsKey: true, keyName: 'geminiApiKey', keyUrl: 'https://aistudio.google.com/app/apikey' },
        'google-vision': { name: 'Google Cloud Vision', desc: 'Powerful optical character recognition', needsKey: true, keyName: 'googleApiKey', keyUrl: 'https://console.cloud.google.com/apis/credentials' }
    };

    // Modal elements
    const modal = document.getElementById('api-key-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-api-key-input');
    const modalHelpText = document.getElementById('modal-help-text');
    const modalCloseBtn = document.getElementById('modal-close');
    const modalCancelBtn = document.getElementById('modal-cancel');
    const modalSaveBtn = document.getElementById('modal-save');
    const toggleVisibilityBtn = document.getElementById('toggle-key-visibility');

    // Provider card elements
    const visionProviderName = document.getElementById('vision-provider-name');
    const visionProviderDesc = document.getElementById('vision-provider-desc');
    const visionStatusBadge = document.getElementById('vision-status-badge');
    const visionAddKeyBtn = document.getElementById('vision-add-key-btn');

    const textProviderName = document.getElementById('text-provider-name');
    const textProviderDesc = document.getElementById('text-provider-desc');
    const textStatusBadge = document.getElementById('text-status-badge');
    const textAddKeyBtn = document.getElementById('text-add-key-btn');

    // Current provider being edited
    let currentProviderType = null;
    let currentProviderInfo = null;

    // Select elements
    const visionApiProvider = document.getElementById('vision-api-provider');
    const textApiProvider = document.getElementById('text-api-provider');
    const visionModel = document.getElementById('vision-model');
    const textModel = document.getElementById('text-model');

    const floatingIconEnabled = document.getElementById('floating-icon-enabled');
    const redirectModeEnabled = document.getElementById('redirect-mode-enabled');
    const saveSettingsBtn = document.getElementById('save-settings');
    const saveIndicator = document.getElementById('save-indicator');

    // Verify result toast
    const showVerifyToast = (message, isSuccess) => {
        // Remove existing toast if any
        const existingToast = document.querySelector('.verify-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'verify-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: ${isSuccess ? 'rgba(16, 185, 129, 0.95)' : 'rgba(248, 113, 113, 0.95)'};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 14px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 10000;
            animation: slideUp 0.3s ease;
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        // Add icon
        const icon = document.createElement('span');
        icon.textContent = isSuccess ? '✓' : '✗';
        icon.style.cssText = `
            font-size: 18px;
            font-weight: bold;
        `;
        toast.prepend(icon);

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const exportBtn = document.getElementById('export-settings');
    const importBtn = document.getElementById('import-settings-btn');
    const importInput = document.getElementById('import-settings-input');

    // Set initial values
    visionApiProvider.value = settings.visionApiProvider;
    textApiProvider.value = settings.textApiProvider;
    // Models will be set after fetch
    floatingIconEnabled.checked = settings.floatingIconEnabled;
    redirectModeEnabled.checked = settings.useRedirectMode;

    const showSaveSuccess = () => {
        saveIndicator.classList.add('visible');
        setTimeout(() => saveIndicator.classList.remove('visible'), 3000);
    };

    // Update provider card display
    const updateProviderCard = (type, provider) => {
        const info = providerInfo[provider];
        const nameEl = type === 'vision' ? visionProviderName : textProviderName;
        const descEl = type === 'vision' ? visionProviderDesc : textProviderDesc;
        const statusBadge = type === 'vision' ? visionStatusBadge : textStatusBadge;
        const addKeyBtn = type === 'vision' ? visionAddKeyBtn : textAddKeyBtn;

        nameEl.textContent = info.name;
        descEl.textContent = info.desc;

        // Update status and add key button visibility
        if (info.needsKey) {
            const hasKey = settings[info.keyName];
            statusBadge.textContent = hasKey ? 'ACTIVE' : 'NEEDS KEY';
            statusBadge.className = hasKey ? 'status-badge saved' : 'status-badge';
            addKeyBtn.style.display = 'inline-flex';
        } else {
            statusBadge.textContent = 'ACTIVE';
            statusBadge.className = 'status-badge saved';
            addKeyBtn.style.display = 'none';
        }
    };

    // Update keys overview badges
    const updateKeysOverview = () => {
        const keyMapping = {
            'openai': { key: 'openaiApiKey', badge: 'overview-openai-status', provider: 'openai' },
            'grok': { key: 'grokApiKey', badge: 'overview-grok-status', provider: 'grok' },
            'google-gemini': { key: 'geminiApiKey', badge: 'overview-gemini-status', provider: 'google-gemini' },
            'ollama-cloud': { key: 'ollamaApiKey', badge: 'overview-ollama-status', provider: 'ollama-cloud' },
            'google-vision': { key: 'googleApiKey', badge: 'overview-google-status', provider: 'google-vision' }
        };

        Object.values(keyMapping).forEach(({ key, badge }) => {
            const badgeEl = document.getElementById(badge);
            if (badgeEl) {
                if (settings[key]) {
                    badgeEl.textContent = 'Configured';
                    badgeEl.classList.add('saved');
                } else {
                    badgeEl.textContent = 'Not Configured';
                    badgeEl.classList.remove('saved');
                }
            }
        });
    };

    // Modal functions
    const openModal = (type, provider) => {
        const info = providerInfo[provider];
        currentProviderType = type;
        currentProviderInfo = info;

        modalTitle.textContent = `Add API Key for ${info.name}`;
        modalInput.value = settings[info.keyName] || '';
        modalHelpText.innerHTML = `Get your key from <a href="${info.keyUrl}" target="_blank">${new URL(info.keyUrl).hostname}</a>`;
        modal.classList.add('visible');
        modalInput.focus();
    };

    const closeModal = () => {
        modal.classList.remove('visible');
        modalInput.value = '';
        currentProviderType = null;
        currentProviderInfo = null;
    };

    const saveApiKey = async () => {
        if (!currentProviderInfo) return;

        const value = modalInput.value.trim();
        if (!value) {
            alert('Please enter an API key');
            return;
        }

        await chrome.storage.local.set({ [currentProviderInfo.keyName]: value });
        settings[currentProviderInfo.keyName] = value;

        updateProviderCard(currentProviderType, currentProviderType === 'vision' ? visionApiProvider.value : textApiProvider.value);
        updateKeysOverview();

        // Refresh models after saving key
        fetchAndPopulateModels('vision', visionApiProvider.value);
        fetchAndPopulateModels('text', textApiProvider.value);

        closeModal();
        showSaveSuccess();
    };

    // Toggle password visibility
    toggleVisibilityBtn.addEventListener('click', () => {
        const isPassword = modalInput.type === 'password';
        modalInput.type = isPassword ? 'text' : 'password';
        document.getElementById('eye-icon').style.display = isPassword ? 'none' : 'block';
        document.getElementById('eye-off-icon').style.display = isPassword ? 'block' : 'none';
    });

    // Modal event listeners
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modalSaveBtn.addEventListener('click', saveApiKey);
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    modalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveApiKey();
        }
    });

    // Add key button listeners
    visionAddKeyBtn.addEventListener('click', () => {
        openModal('vision', visionApiProvider.value);
    });

    textAddKeyBtn.addEventListener('click', () => {
        openModal('text', textApiProvider.value);
    });

    // Verify button handlers
    const verifyApiKey = async (type, provider) => {
        const info = providerInfo[provider];
        if (!info.needsKey) {
            showVerifyToast('This provider does not require an API key.', false);
            return;
        }

        const key = settings[info.keyName];
        if (!key) {
            showVerifyToast('No API key found. Please add a key first.', false);
            return;
        }

        const btn = type === 'vision' ? document.getElementById('vision-verify-btn') : document.getElementById('text-verify-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Verifying...';
        btn.disabled = true;

        try {
            let isValid = false;

            // Make a simple test call to verify the key
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                isValid = response.ok;
                if (!isValid) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'Invalid API key');
                }
            } else if (provider === 'grok') {
                const response = await fetch('https://api.x.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                isValid = response.ok;
                if (!isValid) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'Invalid API key');
                }
            } else if (provider === 'google-gemini') {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                isValid = response.ok;
                if (!isValid) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'Invalid API key');
                }
            } else if (provider === 'google-vision') {
                // Google Vision requires a more complex test - we'll just validate format
                if (key.startsWith('AIza')) {
                    isValid = true;
                } else {
                    throw new Error('Invalid Google Cloud Vision API key format');
                }
            } else if (provider === 'ollama-cloud') {
                // Ollama Cloud - try to get models
                const response = await fetch('https://ollama.com/api/tags', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                isValid = response.ok;
                if (!isValid) {
                    throw new Error('Invalid Ollama Cloud API key');
                }
            }

            if (isValid) {
                showVerifyToast('API key is valid!', true);
            }
        } catch (error) {
            showVerifyToast(`Verification failed: ${error.message}`, false);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    // Add verify button listeners
    document.getElementById('vision-verify-btn').addEventListener('click', () => {
        verifyApiKey('vision', visionApiProvider.value);
    });

    document.getElementById('text-verify-btn').addEventListener('click', () => {
        verifyApiKey('text', textApiProvider.value);
    });

    // Keys overview configure button listeners
    document.querySelectorAll('.configure-key-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.provider;
            // Open modal directly for the provider
            const info = providerInfo[provider];
            currentProviderType = 'overview';
            currentProviderInfo = info;

            modalTitle.textContent = `Add API Key for ${info.name}`;
            modalInput.value = settings[info.keyName] || '';
            modalHelpText.innerHTML = `Get your key from <a href="${info.keyUrl}" target="_blank">${new URL(info.keyUrl).hostname}</a>`;
            modal.classList.add('visible');
            modalInput.focus();
        });
    });

    // Provider change listeners - update card display
    visionApiProvider.addEventListener('change', () => {
        updateProviderCard('vision', visionApiProvider.value);
        fetchAndPopulateModels('vision', visionApiProvider.value);
    });

    textApiProvider.addEventListener('change', () => {
        updateProviderCard('text', textApiProvider.value);
        fetchAndPopulateModels('text', textApiProvider.value);
    });

    redirectModeEnabled.addEventListener('change', () => {
        settings.useRedirectMode = redirectModeEnabled.checked;
        fetchAndPopulateModels('vision', visionApiProvider.value);
        fetchAndPopulateModels('text', textApiProvider.value);
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const newSettings = {
            visionApiProvider: visionApiProvider.value,
            textApiProvider: textApiProvider.value,
            visionModel: visionModel.value,
            textModel: textModel.value,
            floatingIconEnabled: floatingIconEnabled.checked,
            useRedirectMode: redirectModeEnabled.checked,
            // Note: useUnifiedModel, unifiedApiProvider, unifiedModel are set via separate UI
            // They will be included when those UI elements are saved
            ...settings.useUnifiedModel !== undefined ? { useUnifiedModel: settings.useUnifiedModel } : {},
            ...settings.unifiedApiProvider !== undefined ? { unifiedApiProvider: settings.unifiedApiProvider } : {},
            ...settings.unifiedModel !== undefined ? { unifiedModel: settings.unifiedModel } : {},
            ...settings.captureGoal !== undefined ? { captureGoal: settings.captureGoal } : {}
        };

        await chrome.storage.local.set({ screengrabSettings: newSettings });
        settings = { ...settings, ...newSettings };

        // Notify tabs about floating icon
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'toggleFloatingIcon',
                enabled: settings.floatingIconEnabled
            }).catch(() => { });
        });

        showSaveSuccess();
    });

    exportBtn.addEventListener('click', () => {
        // Create a copy of settings with masked API keys
        const exportSettings = { ...settings };
        ['ollamaApiKey', 'googleApiKey', 'openaiApiKey', 'grokApiKey', 'geminiApiKey'].forEach(k => {
            if (exportSettings[k]) exportSettings[k] = 'xxxxxxxxxx';
        });

        const data = JSON.stringify(exportSettings, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'screengrab-settings.json';
        a.click();
    });

    importBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                await chrome.storage.local.set({ screengrabSettings: imported });
                location.reload();
            } catch (err) {
                alert('Invalid settings file');
            }
        };
        reader.readAsText(file);
    });

    // Initial updates
    updateKeysOverview();

    // Initialize provider cards
    updateProviderCard('vision', visionApiProvider.value);
    updateProviderCard('text', textApiProvider.value);
}

/**
 * Dynamically fetch and populate models for a given type and provider
 */
async function fetchAndPopulateModels(type, provider) {
    const select = document.getElementById(`${type}-model`);
    const originalValue = type === 'vision' ? settings.visionModel : settings.textModel;

    // Clear and show loading
    select.innerHTML = '<option>Loading models...</option>';
    select.disabled = true;

    // Special case for Google Vision (no models to select)
    if (provider === 'google-vision') {
        select.innerHTML = '<option value="default" selected>Default Model</option>';
        select.disabled = true;
        return;
    }

    try {
        let apiKey = '';
        if (provider === 'openai') apiKey = settings.openaiApiKey;
        if (provider === 'grok') apiKey = settings.grokApiKey;
        if (provider === 'google-gemini') apiKey = settings.geminiApiKey;
        if (provider === 'ollama-cloud') apiKey = settings.ollamaApiKey;

        // processing for local ollama doesn't need key
        const isLocal = provider === 'ollama';
        const isRedirect = settings.useRedirectMode; // Local setting state

        // In redirect mode, no API Key is needed OR models for that matter (for web providers)
        if (isRedirect && ['openai', 'grok'].includes(provider)) {
            select.innerHTML = `<option value="${originalValue || 'default'}">Provider Chat (Redirect Mode)</option>`;
            select.disabled = true;
            return;
        }

        if (!apiKey && !isLocal) {
            select.innerHTML = '<option value="">Please enter API Key first</option>';
            select.disabled = false;
            return;
        }

        const models = await AIService.getModels(provider, apiKey);

        // Filter based on type if needed (rudimentary filtering)
        let filteredModels = models;
        if (type === 'vision') {
            // For vision, we try to prefer vision-capable models
            // But strict filtering is hard without metadata
            if (provider === 'ollama' || provider === 'ollama-cloud') {
                const categorized = await AIService.categorizeModels(models);
                filteredModels = categorized.multimodal.length > 0 ? categorized.multimodal : models;
            } else if (provider === 'openai') {
                filteredModels = models.filter(m => m.id.includes('gpt-4') || m.id.includes('vision'));
            } else if (provider === 'grok') {
                filteredModels = models.filter(m => m.id.includes('vision'));
            }
        } else {
            // For text, all models usually work, but we might filter out vision-only if known
        }

        if (filteredModels.length === 0) {
            select.innerHTML = '<option value="">No models found (Check API Key)</option>';
            return;
        }

        select.innerHTML = filteredModels.map(m =>
            `<option value="${m.id}" ${m.id === originalValue ? 'selected' : ''}>${m.name}</option>`
        ).join('');

    } catch (error) {
        console.error(`Error fetching models for ${provider}:`, error);
        select.innerHTML = `<option value="">Error: ${error.message}</option>`;

        // Restore defaults for Ollama if fetch fails
        if (provider === 'ollama' || provider === 'ollama-cloud') {
            if (type === 'vision') {
                select.innerHTML += '<option value="qwen3-vl:4b">qwen3-vl:4b (Local)</option>';
            } else {
                select.innerHTML += '<option value="qwen3-coder:480b-cloud">qwen3-coder:480b-cloud (Ollama)</option>';
            }
        }
    } finally {
        select.disabled = false;
    }
}
