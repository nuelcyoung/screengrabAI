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
    // Select elements
    const visionApiProvider = document.getElementById('vision-api-provider');
    const textApiProvider = document.getElementById('text-api-provider');
    const visionModel = document.getElementById('vision-model');
    const textModel = document.getElementById('text-model');

    const floatingIconEnabled = document.getElementById('floating-icon-enabled');
    const redirectModeEnabled = document.getElementById('redirect-mode-enabled');
    const saveSettingsBtn = document.getElementById('save-settings');
    const saveIndicator = document.getElementById('save-indicator');

    // API Key inputs
    const ollamaApiKey = document.getElementById('ollama-api-key');
    const googleApiKey = document.getElementById('google-api-key');
    const openaiApiKey = document.getElementById('openai-api-key');
    const grokApiKey = document.getElementById('grok-api-key');
    const geminiApiKey = document.getElementById('gemini-api-key');

    // Status badges
    const ollamaKeyStatus = document.getElementById('ollama-key-status');
    const googleKeyStatus = document.getElementById('google-key-status');
    const openaiKeyStatus = document.getElementById('openai-key-status');
    const grokKeyStatus = document.getElementById('grok-key-status');
    const geminiKeyStatus = document.getElementById('gemini-key-status');

    // Key groups
    const ollamaKeyGroup = document.getElementById('ollama-key-group');
    const googleKeyGroup = document.getElementById('google-key-group');
    const openaiKeyGroup = document.getElementById('openai-key-group');
    const grokKeyGroup = document.getElementById('grok-key-group');
    const geminiKeyGroup = document.getElementById('gemini-key-group');
    const noApiKeysHint = document.getElementById('no-api-keys-hint');

    // Save buttons
    const saveOllamaKeyBtn = document.getElementById('save-ollama-key');
    const saveGoogleKeyBtn = document.getElementById('save-google-key');
    const saveOpenAIKeyBtn = document.getElementById('save-openai-key');
    const saveGrokKeyBtn = document.getElementById('save-grok-key');
    const saveGeminiKeyBtn = document.getElementById('save-gemini-key');

    const exportBtn = document.getElementById('export-settings');
    const importBtn = document.getElementById('import-settings-btn');
    const importInput = document.getElementById('import-settings-input');

    // Set initial values
    visionApiProvider.value = settings.visionApiProvider;
    textApiProvider.value = settings.textApiProvider;
    // Models will be set after fetch
    ollamaApiKey.value = settings.ollamaApiKey || '';
    googleApiKey.value = settings.googleApiKey || '';
    openaiApiKey.value = settings.openaiApiKey || '';
    grokApiKey.value = settings.grokApiKey || '';
    geminiApiKey.value = settings.geminiApiKey || '';
    floatingIconEnabled.checked = settings.floatingIconEnabled;
    redirectModeEnabled.checked = settings.useRedirectMode;

    // Helper functions
    const updateKeyVisibility = () => {
        const vProvider = visionApiProvider.value;
        const tProvider = textApiProvider.value;
        const isRedirect = redirectModeEnabled.checked; // Check if Redirect Mode is active

        // Hide all first
        [ollamaKeyGroup, googleKeyGroup, openaiKeyGroup, grokKeyGroup, geminiKeyGroup].forEach(g => {
            g.style.display = 'none';
            g.classList.remove('missing-key');
        });
        noApiKeysHint.style.display = 'none';

        let needed = false;

        const showKeyGroup = (group, key) => {
            group.style.display = 'block';
            if (!key) group.classList.add('missing-key');
        };

        if (vProvider === 'ollama-cloud' || tProvider === 'ollama-cloud') {
            showKeyGroup(ollamaKeyGroup, settings.ollamaApiKey);
            needed = true;
        }

        // If it is Redirect Mode, we don't need UI for API Keys for web providers!
        if (!isRedirect) {
            if (vProvider === 'google-vision') {
                showKeyGroup(googleKeyGroup, settings.googleApiKey);
                needed = true;
            }
            if (vProvider === 'openai' || tProvider === 'openai') {
                showKeyGroup(openaiKeyGroup, settings.openaiApiKey);
                needed = true;
            }
            if (vProvider === 'grok' || tProvider === 'grok') {
                showKeyGroup(grokKeyGroup, settings.grokApiKey);
                needed = true;
            }
            if (vProvider === 'google-gemini' || tProvider === 'google-gemini') {
                showKeyGroup(geminiKeyGroup, settings.geminiApiKey);
                needed = true;
            }
        }

        if (!needed) {
            noApiKeysHint.style.display = 'block';
            if (isRedirect) {
                noApiKeysHint.innerHTML = '<p>Redirect Mode is enabled. No API keys needed for web providers.</p>';
            } else {
                noApiKeysHint.innerHTML = '<p>No API keys needed for local Ollama. Select a cloud provider in AI Models to add keys.</p>';
            }
        }
    };

    const updateKeyStatus = () => {
        const updateStatus = (key, element) => {
            if (key) {
                element.textContent = 'Saved';
                element.classList.add('saved');
            } else {
                element.textContent = 'Not saved';
                element.classList.remove('saved');
            }
        };

        updateStatus(settings.ollamaApiKey, ollamaKeyStatus);
        updateStatus(settings.googleApiKey, googleKeyStatus);
        updateStatus(settings.openaiApiKey, openaiKeyStatus);
        updateStatus(settings.grokApiKey, grokKeyStatus);
        updateStatus(settings.geminiApiKey, geminiKeyStatus);
    };

    const showSaveSuccess = () => {
        saveIndicator.classList.add('visible');
        setTimeout(() => saveIndicator.classList.remove('visible'), 3000);
    };

    // Event listeners
    visionApiProvider.addEventListener('change', () => {
        updateKeyVisibility();
        fetchAndPopulateModels('vision', visionApiProvider.value);
    });

    textApiProvider.addEventListener('change', () => {
        updateKeyVisibility();
        fetchAndPopulateModels('text', textApiProvider.value);
    });

    redirectModeEnabled.addEventListener('change', () => {
        settings.useRedirectMode = redirectModeEnabled.checked; // Sync temporary setting for UI effects
        updateKeyVisibility();
        fetchAndPopulateModels('vision', visionApiProvider.value);
        fetchAndPopulateModels('text', textApiProvider.value);
    });

    // Save Key Handlers
    const setupSaveKeyHandler = (btn, input, keyName) => {
        btn.addEventListener('click', async () => {
            const val = input.value.trim();
            if (!val) return alert('Please enter an API key');
            await chrome.storage.local.set({ [keyName]: val });
            settings[keyName] = val;
            updateKeyStatus();
            updateKeyVisibility(); // Refresh warnings
            showSaveSuccess();
            // Refresh models after saving key
            fetchAndPopulateModels('vision', visionApiProvider.value);
            fetchAndPopulateModels('text', textApiProvider.value);
        });
    };

    setupSaveKeyHandler(saveOllamaKeyBtn, ollamaApiKey, 'ollamaApiKey');
    setupSaveKeyHandler(saveGoogleKeyBtn, googleApiKey, 'googleApiKey');
    setupSaveKeyHandler(saveOpenAIKeyBtn, openaiApiKey, 'openaiApiKey');
    setupSaveKeyHandler(saveGrokKeyBtn, grokApiKey, 'grokApiKey');
    setupSaveKeyHandler(saveGeminiKeyBtn, geminiApiKey, 'geminiApiKey');

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
    updateKeyVisibility();
    updateKeyStatus();
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
