// Settings state
let settings = {
    visionApiProvider: 'ollama',
    textApiProvider: 'ollama',
    ollamaApiKey: '',
    googleApiKey: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    visionModel: 'qwen3-vl:4b',
    textModel: 'qwen3-coder:480b-cloud',
    floatingIconEnabled: true
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
        'anthropicApiKey',
        'geminiApiKey'
    ]);
    const storedSettings = stored.screengrabSettings || {};

    settings = {
        visionApiProvider: storedSettings.visionApiProvider || 'ollama',
        textApiProvider: storedSettings.textApiProvider || 'ollama',
        ollamaApiKey: stored.ollamaApiKey || '',
        googleApiKey: stored.googleApiKey || '',
        openaiApiKey: stored.openaiApiKey || '',
        anthropicApiKey: stored.anthropicApiKey || '',
        geminiApiKey: stored.geminiApiKey || '',
        visionModel: storedSettings.visionModel || 'qwen3-vl:4b',
        textModel: storedSettings.textModel || 'qwen3-coder:480b-cloud',
        floatingIconEnabled: storedSettings.floatingIconEnabled !== false
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
    const saveSettingsBtn = document.getElementById('save-settings');
    const saveIndicator = document.getElementById('save-indicator');

    // API Key inputs
    const ollamaApiKey = document.getElementById('ollama-api-key');
    const googleApiKey = document.getElementById('google-api-key');
    const openaiApiKey = document.getElementById('openai-api-key');
    const anthropicApiKey = document.getElementById('anthropic-api-key');
    const geminiApiKey = document.getElementById('gemini-api-key');

    // Status badges
    const ollamaKeyStatus = document.getElementById('ollama-key-status');
    const googleKeyStatus = document.getElementById('google-key-status');
    const openaiKeyStatus = document.getElementById('openai-key-status');
    const anthropicKeyStatus = document.getElementById('anthropic-key-status');
    const geminiKeyStatus = document.getElementById('gemini-key-status');

    // Key groups
    const ollamaKeyGroup = document.getElementById('ollama-key-group');
    const googleKeyGroup = document.getElementById('google-key-group');
    const openaiKeyGroup = document.getElementById('openai-key-group');
    const anthropicKeyGroup = document.getElementById('anthropic-key-group');
    const geminiKeyGroup = document.getElementById('gemini-key-group');
    const noApiKeysHint = document.getElementById('no-api-keys-hint');

    // Save buttons
    const saveOllamaKeyBtn = document.getElementById('save-ollama-key');
    const saveGoogleKeyBtn = document.getElementById('save-google-key');
    const saveOpenAIKeyBtn = document.getElementById('save-openai-key');
    const saveAnthropicKeyBtn = document.getElementById('save-anthropic-key');
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
    anthropicApiKey.value = settings.anthropicApiKey || '';
    geminiApiKey.value = settings.geminiApiKey || '';
    floatingIconEnabled.checked = settings.floatingIconEnabled;

    // Helper functions
    const updateKeyVisibility = () => {
        const vProvider = visionApiProvider.value;
        const tProvider = textApiProvider.value;

        // Hide all first
        [ollamaKeyGroup, googleKeyGroup, openaiKeyGroup, anthropicKeyGroup, geminiKeyGroup].forEach(g => {
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
        if (vProvider === 'google-vision') {
            showKeyGroup(googleKeyGroup, settings.googleApiKey);
            needed = true;
        }
        if (vProvider === 'openai' || tProvider === 'openai') {
            showKeyGroup(openaiKeyGroup, settings.openaiApiKey);
            needed = true;
        }
        if (vProvider === 'anthropic' || tProvider === 'anthropic') {
            showKeyGroup(anthropicKeyGroup, settings.anthropicApiKey);
            needed = true;
        }
        if (vProvider === 'google-gemini' || tProvider === 'google-gemini') {
            showKeyGroup(geminiKeyGroup, settings.geminiApiKey);
            needed = true;
        }

        if (!needed) {
            noApiKeysHint.style.display = 'block';
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
        updateStatus(settings.anthropicApiKey, anthropicKeyStatus);
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
    setupSaveKeyHandler(saveAnthropicKeyBtn, anthropicApiKey, 'anthropicApiKey');
    setupSaveKeyHandler(saveGeminiKeyBtn, geminiApiKey, 'geminiApiKey');

    saveSettingsBtn.addEventListener('click', async () => {
        const newSettings = {
            visionApiProvider: visionApiProvider.value,
            textApiProvider: textApiProvider.value,
            visionModel: visionModel.value,
            textModel: textModel.value,
            floatingIconEnabled: floatingIconEnabled.checked
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
        ['ollamaApiKey', 'googleApiKey', 'openaiApiKey', 'anthropicApiKey', 'geminiApiKey'].forEach(k => {
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
        if (provider === 'anthropic') apiKey = settings.anthropicApiKey;
        if (provider === 'google-gemini') apiKey = settings.geminiApiKey;
        if (provider === 'ollama-cloud') apiKey = settings.ollamaApiKey;

        // processing for local ollama doesn't need key
        const isLocal = provider === 'ollama';

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
                const categorized = AIService.categorizeModels(models);
                filteredModels = categorized.visionModels.length > 0 ? categorized.visionModels : models;
            } else if (provider === 'openai') {
                filteredModels = models.filter(m => m.id.includes('gpt-4') || m.id.includes('vision'));
            } else if (provider === 'anthropic') {
                filteredModels = models.filter(m => m.id.includes('sonnet') || m.id.includes('opus'));
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
