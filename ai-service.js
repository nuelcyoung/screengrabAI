/**
 * Ollama Service - Centralized API client for Ollama Local and Cloud
 *
 * Endpoints:
 * - Local: http://localhost:11434/api (HTTP only)
 * - Cloud: https://ollama.com/api (HTTPS)
 * - Google Vision: https://vision.googleapis.com/v1/images:annotate
 */

const AIService = {
    // LLM Providers
    // Note: These IDs must match ai-service-multimodal.js PROVIDERS
    PROVIDERS: {
        OLLAMA_LOCAL: 'ollama_local',         // Changed from 'ollama' for consistency
        OLLAMA_CLOUD: 'ollama_cloud',         // Changed from 'ollama-cloud' for consistency
        GOOGLE_VISION: 'google-vision',
        OPENAI: 'openai',
        GROK: 'grok',
        GOOGLE_GEMINI: 'google-gemini'
    },

    // Legacy provider ID mappings for backward compatibility
    // Maps old IDs to new standardized IDs
    PROVIDER_ALIASES: {
        'ollama': 'ollama_local',
        'ollama-cloud': 'ollama_cloud'
    },

    /**
     * Normalize provider ID to handle legacy aliases
     */
    normalizeProviderId(provider) {
        return this.PROVIDER_ALIASES[provider] || provider;
    },

    // API endpoints
    ENDPOINTS: {
        local: 'http://localhost:11434',
        cloud: 'https://ollama.com',
        googleVision: 'https://vision.googleapis.com/v1',
        openai: 'https://api.openai.com/v1',
        grok: 'https://api.x.ai/v1',
        googleGemini: 'https://generativelanguage.googleapis.com/v1beta'
    },

    // Model Cache - uses chrome.storage.session to persist across service worker restarts
    CACHE: {
        async get(key) {
            try {
                const result = await chrome.storage.session.get(key);
                return result[key];
            } catch {
                return undefined;
            }
        },
        async set(key, value, ttlMs) {
            try {
                const expiry = Date.now() + ttlMs;
                await chrome.storage.session.set({ [key]: { value, expiry } });
            } catch {
                // Silently fail if storage.session unavailable
            }
        },
        async getModels(cacheKey) {
            try {
                const result = await chrome.storage.session.get(cacheKey);
                const cached = result[cacheKey];
                if (cached && cached.expiry > Date.now()) {
                    return cached.value;
                }
                return undefined;
            } catch {
                return undefined;
            }
        },
        async setModels(cacheKey, models, ttlMs = 3600000) {
            try {
                const expiry = Date.now() + ttlMs;
                await chrome.storage.session.set({ [cacheKey]: { value: models, expiry } });
            } catch {
                // Silently fail if storage.session unavailable
            }
        }
    },

    // Timeout for API calls (2 minutes)
    TIMEOUT_MS: 120000,

    /**
     * Get the base URL for the given provider
     */
    getBaseUrl(provider) {
        if (provider === this.PROVIDERS.OLLAMA_CLOUD) return this.ENDPOINTS.cloud;
        if (provider === this.PROVIDERS.GOOGLE_VISION) return this.ENDPOINTS.googleVision;
        if (provider === this.PROVIDERS.OPENAI) return this.ENDPOINTS.openai;
        if (provider === this.PROVIDERS.GROK) return this.ENDPOINTS.grok;
        if (provider === this.PROVIDERS.GOOGLE_GEMINI) return this.ENDPOINTS.googleGemini;
        return this.ENDPOINTS.local;
    },

    /**
     * Get available models from the provider
     */
    async getModels(provider, apiKey) {
        // Normalize provider ID to handle legacy aliases
        provider = this.normalizeProviderId(provider);

        const cacheKey = `${provider}-${apiKey || 'no-key'}`;

        // Return cached models if valid (1 hour cache)
        const cachedModels = await this.CACHE.getModels(cacheKey);
        if (cachedModels) {
            return cachedModels;
        }

        let models = [];
        if (
            (provider === this.PROVIDERS.OPENAI ||
                provider === this.PROVIDERS.GROK ||
                provider === this.PROVIDERS.GOOGLE_GEMINI ||
                provider === this.PROVIDERS.OLLAMA_CLOUD) &&
            !apiKey
        ) {
            throw new Error('API Key is required for this provider');
        }

        try {
            if (provider === this.PROVIDERS.OLLAMA_LOCAL || provider === this.PROVIDERS.OLLAMA_CLOUD) {
                // Keep existing Ollama logic but standardized
                const localModels = await this.getLocalModels();
                models = localModels.map(m => ({ id: m.name, name: m.name }));
            } else if (provider === this.PROVIDERS.OPENAI) {
                const response = await fetch(`${this.ENDPOINTS.openai}/models`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!response.ok) throw new Error('Failed to fetch OpenAI models');
                const data = await response.json();
                models = data.data
                    .filter(m => m.id.includes('gpt'))
                    .map(m => ({ id: m.id, name: m.id }));
            } else if (provider === this.PROVIDERS.GROK) {
                const response = await fetch(`${this.ENDPOINTS.grok}/models`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!response.ok) throw new Error('Failed to fetch Grok models');
                const data = await response.json();
                models = data.data
                    .filter(m => m.id.includes('grok'))
                    .map(m => ({ id: m.id, name: m.id }));
            } else if (provider === this.PROVIDERS.GOOGLE_GEMINI) {
                const response = await fetch(`${this.ENDPOINTS.googleGemini}/models?key=${apiKey}`);
                if (!response.ok) throw new Error('Failed to fetch Gemini models');
                const data = await response.json();
                models = data.models
                    .filter(m => m.name.includes('gemini'))
                    .map(m => {
                        const id = m.name.replace('models/', '');
                        return { id: id, name: m.displayName || id };
                    });
            }

            // Cache results using chrome.storage.session (persists across service worker restarts)
            await this.CACHE.setModels(cacheKey, models, 3600000); // 1 hour TTL

            return models;
        } catch (error) {
            console.error(`[AIService] Error fetching models for ${provider}:`, error);
            throw error;
        }
    },

    /**
     * Check if Ollama local server is running
     */
    async checkLocalHealth() {
        try {
            const response = await fetch(`${this.ENDPOINTS.local}/api/tags`, {
                method: 'GET'
            });
            if (!response.ok) {
                throw new Error('Ollama is not responding');
            }
            return await response.json();
        } catch (error) {
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to Ollama at localhost:11434. Is it running?');
            }
            throw error;
        }
    },

    /**
     * Check if a model is available locally
     */
    async hasLocalModel(modelName) {
        const data = await this.checkLocalHealth();
        const baseModelName = modelName.split(':')[0];
        return data.models?.some(m => m.name.includes(baseModelName)) || false;
    },

    /**
     * Get list of all available local models
     */
    async getLocalModels() {
        try {
            const response = await fetch(`${this.ENDPOINTS.local}/api/tags`);
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('[AIService] Error fetching local models:', error);
            return [];
        }
    },

    /**
     * Categorize models as vision or text models
     *
     * For Ollama providers, uses queryOllamaModelIsMultimodal() to query the
     * running instance directly (accurate for arbitrary local models).
     *
     * For cloud providers, uses a synchronous allowlist check.
     *
     * @param {Array} models - Array of model objects with id/name properties
     * @param {string} provider - Provider key (e.g., 'ollama', 'ollama-cloud', 'openai')
     * @param {string} [baseUrl] - Required for Ollama providers
     * @param {string} [apiKey] - Optional API key for Ollama cloud
     * @returns {Promise<{multimodal: Array, textOnly: Array}>}
     */
    async categorizeModels(models, provider, baseUrl, apiKey) {
        // For Ollama providers, use the async query method
        if (provider === this.PROVIDERS.OLLAMA_LOCAL || provider === this.PROVIDERS.OLLAMA_CLOUD) {
            // Import MultimodalService for queryOllamaModelIsMultimodal
            // (it's imported in background.js, check if it's available globally)
            const hasCapabilityCheck = typeof MultimodalService !== 'undefined' &&
                typeof MultimodalService.queryOllamaModelIsMultimodal === 'function';

            if (hasCapabilityCheck) {
                return await MultimodalService.categorizeOllamaModels(models, baseUrl, apiKey);
            }

            // Fallback to name heuristic if MultimodalService unavailable
            console.warn('[AIService] MultimodalService not available, using name heuristic for Ollama models');
            const visionModels = [];
            const textModels = [];

            for (const model of models) {
                const name = model.name.toLowerCase();
                // Vision models typically contain "vl" (vision-language) in their name
                // Note: This is a fallback - qwen3.5, etc. may be misclassified
                if (name.includes('vl') || name.includes('vision')) {
                    visionModels.push(model);
                } else {
                    textModels.push(model);
                }
            }

            return { multimodal: visionModels, textOnly: textModels };
        }

        // For cloud providers, use synchronous allowlist
        const visionModels = [];
        const textModels = [];

        for (const model of models) {
            const id = (model.id || model.name || '').toLowerCase();

            if (provider === this.PROVIDERS.OPENAI) {
                // OpenAI vision models
                if (id.includes('gpt-4o') || id.includes('gpt-4-vision') || id.includes('vision')) {
                    visionModels.push(model);
                } else {
                    textModels.push(model);
                }
            } else if (provider === this.PROVIDERS.GROK) {
                // Grok vision models (grok-2-vision and newer)
                if (id.includes('vision') || id.includes('grok-2-vision')) {
                    visionModels.push(model);
                } else {
                    textModels.push(model);
                }
            } else if (provider === this.PROVIDERS.GOOGLE_GEMINI) {
                // Gemini models (most are multimodal)
                if (id.includes('gemini')) {
                    visionModels.push(model);
                } else {
                    textModels.push(model);
                }
            } else {
                // Unknown provider - use text only as safe default
                textModels.push(model);
            }
        }

        return { multimodal: visionModels, textOnly: textModels };
    },

    validateRequiredKey(provider, settings) {
        // Normalize provider ID first
        const normalizedProvider = this.normalizeProviderId(provider);

        // Skip validation for providers that support redirect mode if it is enabled
        const isRedirectableWebProvider = ['openai', 'grok'].includes(normalizedProvider);
        if (settings.useRedirectMode && isRedirectableWebProvider) return;

        if (normalizedProvider === 'openai' && !settings.openaiApiKey) throw new Error('OpenAI API Key is required');
        if (normalizedProvider === 'grok' && !settings.grokApiKey) throw new Error('Grok API Key is required');
        if (normalizedProvider === 'google-gemini' && !settings.geminiApiKey) throw new Error('Gemini API Key is required');
        if (normalizedProvider === 'ollama_cloud' && !settings.ollamaApiKey) throw new Error('Ollama Cloud API Key is required');
        if (normalizedProvider === 'google-vision' && !settings.googleApiKey) throw new Error('Google Cloud Vision API Key is required');
    },

    /**
     * Build headers for API request
     */
    buildHeaders(provider, apiKey) {
        const normalizedProvider = this.normalizeProviderId(provider);
        const headers = { 'Content-Type': 'application/json' };
        if (normalizedProvider === 'ollama_cloud' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (normalizedProvider === 'google-vision' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (normalizedProvider === 'openai' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (normalizedProvider === 'grok' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (normalizedProvider === 'google-gemini') {
            // Gemini uses query param for key mostly, but can use header in some contexts
            // We'll handle it in the request construction
        }
        return headers;
    },

    /**
     * Describe an image using vision model (OCR/text extraction)
     */
    async describeImage(base64Image, settings, onProgress) {
        const { visionApiProvider, visionModel, ...apiKeys } = settings;
        // Normalize provider ID for backward compatibility
        const normalizedProvider = this.normalizeProviderId(visionApiProvider);
        this.validateRequiredKey(normalizedProvider, settings);

        switch (normalizedProvider) {
            case this.PROVIDERS.OLLAMA_LOCAL:
            case this.PROVIDERS.OLLAMA_CLOUD:
                return this.describeImageOllama(base64Image, settings, onProgress);
            case this.PROVIDERS.GOOGLE_VISION:
                return this.describeImageGoogleVision(base64Image, settings, onProgress);
            case this.PROVIDERS.OPENAI:
                return this.describeImageOpenAI(base64Image, settings, onProgress);
            case this.PROVIDERS.GROK:
                return this.describeImageGrok(base64Image, settings, onProgress);
            case this.PROVIDERS.GOOGLE_GEMINI:
                return this.describeImageGemini(base64Image, settings, onProgress);
            default:
                throw new Error(`Unknown vision provider: ${visionApiProvider}`);
        }
    },

    /**
     * Ollama Image Description Implementation
     */
    async describeImageOllama(base64Image, settings, onProgress) {
        const { visionApiProvider, visionModel, ollamaApiKey } = settings;
        const normalizedProvider = this.normalizeProviderId(visionApiProvider);
        const baseUrl = this.getBaseUrl(normalizedProvider);
        const isCloud = normalizedProvider === this.PROVIDERS.OLLAMA_CLOUD;

        // Check local availability if using local
        if (!isCloud) {
            const hasModel = await this.hasLocalModel(visionModel);
            if (!hasModel) {
                throw new Error(`${visionModel} model not found. Run: ollama pull ${visionModel}`);
            }
        }

        const headers = this.buildHeaders(visionApiProvider, ollamaApiKey);

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Vision analysis timeout (120s)')), this.TIMEOUT_MS)
        );

        // Create fetch promise - Try chat completions API first (better for vision models)
        const fetchPromise = (async () => {
            // Prepare the image with proper data URL prefix if not present
            let imageData = base64Image;
            if (!imageData.startsWith('data:')) {
                imageData = `data:image/png;base64,${base64Image}`;
            }

            // Try chat completions API first (OpenAI-compatible, better for vision models like qwen-vl)
            const chatRequestBody = {
                model: visionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract ALL visible text from this image. Return only the extracted text content with no explanations or descriptions.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                stream: false
            };

            try {
                const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(chatRequestBody)
                });

                if (chatResponse.ok) {
                    const chatData = await chatResponse.json();
                    const content = chatData.choices?.[0]?.message?.content;

                    // Validate that we got a real response, not an error or API documentation
                    // Some models respond with their own API docs when they don't understand the request
                    if (content && typeof content === 'string' && content.length > 0) {
                        // Check for common error responses or API documentation patterns
                        const errorPatterns = [
                            '/v1/chat/completions',
                            'OpenAI-compatible',
                            'API endpoint',
                            'POST /v1/',
                            '{"error":'
                        ];

                        const hasErrorPattern = errorPatterns.some(pattern => content.includes(pattern));

                        if (!hasErrorPattern) {
                            // Valid response - return it
                            if (onProgress) onProgress(content, content.length);
                            return content;
                        }

                        // If we hit this, the model likely doesn't support vision via chat completions
                        console.warn('[AIService] Chat completions API returned unexpected response - model may not support vision. Falling back to generate API.');
                    }
                }
            } catch (chatError) {
                // Chat API failed, will fall back to generate API
                console.warn('[AIService] Chat completions API failed:', chatError.message);
            }

            // Fallback to generate API
            const requestBody = {
                model: visionModel,
                prompt: 'Extract ALL visible text from this image. Return only the extracted text content with no explanations or descriptions.',
                images: [base64Image],
                stream: false,
                options: {
                    num_predict: 16384
                }
            };

            const response = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Vision analysis failed (${response.status}): ${errorText}`);
            }

            // Non-streaming response - parse JSON directly
            const data = await response.json();

            if (!data.response) {
                throw new Error('Model returned empty response. Try a different vision model.');
            }

            if (onProgress) onProgress(data.response, data.response.length);
            return data.response;
        })();

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        return result || 'No text extracted from image';
    },

    /**
     * Describe an image using Google Cloud Vision API
     */
    async describeImageGoogleVision(base64Image, settings, onProgress) {
        const { googleApiKey } = settings;

        if (!googleApiKey) {
            throw new Error('Google Cloud Vision API key is required');
        }

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Google Vision analysis timeout (120s)')), this.TIMEOUT_MS)
        );

        // Create fetch promise
        const fetchPromise = (async () => {
            const requestBody = {
                requests: [{
                    image: {
                        content: base64Image
                    },
                    features: [{
                        type: 'TEXT_DETECTION' // This is the OCR feature
                    }]
                }]
            };

            const response = await fetch(`${this.ENDPOINTS.googleVision}/images:annotate?key=${googleApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Google Vision analysis failed (${response.status}): ${errorText}`;

                try {
                    const errorJson = JSON.parse(errorText);
                    const error = errorJson.error;
                    if (error) {
                        if (error.code === 403) {
                            if (error.status === 'PERMISSION_DENIED') {
                                errorMessage = `Google Vision API access denied (403). Possible reasons:\n1. Cloud Vision API is not enabled in your Google Cloud Project.\n2. Your API key is restricted and doesn't allow "Cloud Vision API".\n3. Billing might not be enabled for your project.\n\nTechnical details: ${error.message}`;
                            } else {
                                errorMessage = `Google Vision API 403 error: ${error.message}`;
                            }
                        } else if (error.message) {
                            errorMessage = `Google Vision API error: ${error.message}`;
                        }
                    }
                } catch (e) {
                    // Keep original errorMessage if JSON parsing fails
                }

                throw new Error(errorMessage);
            }

            const data = await response.json();

            // Extract the full text annotation from the response
            const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;
            if (!fullTextAnnotation) {
                return 'No text detected in image';
            }

            const extractedText = fullTextAnnotation.text || '';

            if (onProgress) onProgress(extractedText, extractedText.length);
            return extractedText;
        })();

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        return result || 'No text extracted from image';
    },

    /**
     * Analyze text using text model
     */
    async analyzeText(text, settings, onProgress) {
        const { textApiProvider, textModel, ...apiKeys } = settings;
        // Normalize provider ID for backward compatibility
        const normalizedProvider = this.normalizeProviderId(textApiProvider);
        this.validateRequiredKey(normalizedProvider, settings);

        switch (normalizedProvider) {
            case this.PROVIDERS.OLLAMA_LOCAL:
            case this.PROVIDERS.OLLAMA_CLOUD:
                return this.analyzeTextOllama(text, settings, onProgress);
            case this.PROVIDERS.OPENAI:
                return this.analyzeTextOpenAI(text, settings, onProgress);
            case this.PROVIDERS.GROK:
                return this.analyzeTextGrok(text, settings, onProgress);
            case this.PROVIDERS.GOOGLE_GEMINI:
                return this.analyzeTextGemini(text, settings, onProgress);
            default:
                throw new Error(`Unknown text provider: ${textApiProvider}`);
        }
    },

    /**
     * Ollama Text Analysis Implementation
     */
    async analyzeTextOllama(text, settings, onProgress) {
        const { textApiProvider, textModel, ollamaApiKey } = settings;
        const normalizedProvider = this.normalizeProviderId(textApiProvider);
        const baseUrl = this.getBaseUrl(normalizedProvider);
        const headers = this.buildHeaders(normalizedProvider, ollamaApiKey);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Text analysis timeout (120s)')), this.TIMEOUT_MS)
        );

        const fetchPromise = (async () => {
            const requestBody = {
                model: textModel,
                prompt: `You are analyzing text extracted from an image. Analyze the text content:\n\n${text}\n\nunderstand the context. think to understand, solve and provide the correct answers based on the question asked text as a helpful assistant.`,
                stream: false,
                options: {
                    num_predict: 16384
                }
            };

            const response = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Text analysis failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            if (onProgress) onProgress(data.response, data.response?.length || 0);
            return data.response;
        })();

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        return result || 'No analysis generated';
    },

    /**
     * Ask a follow-up question with conversation context
     */
    async askFollowUp(question, conversationHistory, settings, onProgress) {
        const { textApiProvider, ...apiKeys } = settings;
        // Normalize provider ID for backward compatibility
        const normalizedProvider = this.normalizeProviderId(textApiProvider);
        this.validateRequiredKey(normalizedProvider, settings);

        switch (normalizedProvider) {
            case this.PROVIDERS.OLLAMA_LOCAL:
            case this.PROVIDERS.OLLAMA_CLOUD:
                return this.askFollowUpOllama(question, conversationHistory, settings, onProgress);
            case this.PROVIDERS.OPENAI:
                return this.askFollowUpOpenAI(question, conversationHistory, settings, onProgress);
            case this.PROVIDERS.GROK:
                return this.askFollowUpGrok(question, conversationHistory, settings, onProgress);
            case this.PROVIDERS.GOOGLE_GEMINI:
                return this.askFollowUpGemini(question, conversationHistory, settings, onProgress);
            default:
                throw new Error(`Unknown text provider: ${textApiProvider}`);
        }
    },

    async askFollowUpOllama(question, conversationHistory, settings, onProgress) {
        const { textApiProvider, textModel, ollamaApiKey } = settings;
        const normalizedProvider = this.normalizeProviderId(textApiProvider);
        const baseUrl = this.getBaseUrl(normalizedProvider);
        const headers = this.buildHeaders(normalizedProvider, ollamaApiKey);

        // For local Ollama, check if server is running
        if (normalizedProvider === this.PROVIDERS.OLLAMA_LOCAL) {
            try {
                await this.checkLocalHealth();
            } catch (healthError) {
                throw new Error('Ollama is not running. Please start Ollama locally.');
            }
        }

        // Build conversation context
        let contextPrompt = 'You are a helpful AI assistant answering questions about a screenshot that was analyzed using OCR (Optical Character Recognition) and AI analysis. ';
        contextPrompt += 'The original screenshot contained visual content which was extracted and analyzed.\n\n';
        contextPrompt += 'Conversation history:\n\n';

        for (const msg of conversationHistory) {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            contextPrompt += `${role}: ${msg.content}\n\n`;
        }

        contextPrompt += `\nUser's follow-up question: ${question}\n\n`;
        contextPrompt += 'Answer the question based on the conversation context above. If the question is about the original screenshot content, refer to the OCR/analysis results in the conversation history.';

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Follow-up analysis timeout (120s)')), this.TIMEOUT_MS)
        );

        const fetchPromise = (async () => {
            const response = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: textModel,
                    prompt: contextPrompt,
                    stream: false,
                    options: {
                        num_predict: 16384
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Follow-up analysis failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            if (onProgress) onProgress(data.response, data.response?.length || 0);
            return data.response;
        })();

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        return result || 'No response generated';
    },

    // OpenAI Implementations
    async describeImageOpenAI(base64Image, settings, onProgress) {
        const { visionModel, openaiApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.OPENAI, openaiApiKey);

        let imageData = base64Image;
        if (!imageData.startsWith('data:')) {
            imageData = `data:image/png;base64,${base64Image}`;
        }

        const body = {
            model: visionModel || "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extract ALL visible text from this image. Return only the extracted text content with no explanations or descriptions." },
                        { type: "image_url", image_url: { url: imageData } }
                    ]
                }
            ],
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.openai}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI Vision failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async analyzeTextOpenAI(text, settings, onProgress) {
        const { textModel, openaiApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.OPENAI, openaiApiKey);

        const body = {
            model: textModel || "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful assistant analyzing text extracted from an image." },
                { role: "user", content: `Analyze the text content:\n\n${text}\n\nUnderstand the context, solve any problems, and provide helpful answers.` }
            ],
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.openai}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI Text Analysis failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async askFollowUpOpenAI(question, conversationHistory, settings, onProgress) {
        const { textModel, openaiApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.OPENAI, openaiApiKey);

        const messages = [
            { role: "system", content: "You are a helpful AI assistant answering questions about a screenshot that was analyzed using OCR. Use the conversation history to understand context." }
        ];

        // Convert history format
        conversationHistory.forEach(msg => {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        });

        messages.push({ role: "user", content: question });

        const body = {
            model: textModel || "gpt-4o",
            messages: messages,
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.openai}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI Follow-up failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    // Grok Implementations (xAI API — OpenAI-compatible format)
    async describeImageGrok(base64Image, settings, onProgress) {
        const { visionModel, grokApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.GROK, grokApiKey);

        let imageData = base64Image;
        if (!imageData.startsWith('data:')) {
            imageData = `data:image/png;base64,${base64Image}`;
        }

        const body = {
            model: visionModel || 'grok-2-vision-1212',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Extract ALL visible text from this image. Return only the extracted text content with no explanations or descriptions.' },
                        { type: 'image_url', image_url: { url: imageData } }
                    ]
                }
            ],
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.grok}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Grok Vision failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async analyzeTextGrok(text, settings, onProgress) {
        const { textModel, grokApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.GROK, grokApiKey);

        const body = {
            model: textModel || 'grok-3-mini',
            messages: [
                { role: 'system', content: 'You are a helpful assistant analyzing text extracted from an image.' },
                { role: 'user', content: `Analyze the text content:\n\n${text}\n\nUnderstand the context, solve any problems, and provide helpful answers.` }
            ],
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.grok}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Grok Text Analysis failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async askFollowUpGrok(question, conversationHistory, settings, onProgress) {
        const { textModel, grokApiKey } = settings;
        const headers = this.buildHeaders(this.PROVIDERS.GROK, grokApiKey);

        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant answering questions about a screenshot that was analyzed using OCR. Use the conversation history to understand context.' }
        ];

        conversationHistory.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
        messages.push({ role: 'user', content: question });

        const body = {
            model: textModel || 'grok-3-mini',
            messages,
            max_tokens: 4096
        };

        const response = await fetch(`${this.ENDPOINTS.grok}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Grok Follow-up failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    // Google Gemini Implementations
    async describeImageGemini(base64Image, settings, onProgress) {
        const { visionModel, geminiApiKey } = settings;
        // Gemini uses API key in query param usually
        const model = visionModel || "gemini-2.0-flash-exp";

        let imageContent = base64Image;
        if (imageContent.startsWith('data:image/')) {
            imageContent = imageContent.split(',')[1];
        }

        const body = {
            contents: [{
                parts: [
                    { text: "Extract ALL visible text from this image. Return only the extracted text content with no explanations or descriptions." },
                    {
                        inline_data: {
                            mime_type: "image/png",
                            data: imageContent
                        }
                    }
                ]
            }]
        };

        const response = await fetch(`${this.ENDPOINTS.googleGemini}/models/${model}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini Vision failed: ${err}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No text detected";
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async analyzeTextGemini(text, settings, onProgress) {
        const { textModel, geminiApiKey } = settings;
        const model = textModel || "gemini-2.0-flash-exp";

        const body = {
            contents: [{
                parts: [{
                    text: `Analyze the text extracted from an image:\n\n${text}\n\nUnderstand the context, solve any problems, and provide helpful answers.`
                }]
            }]
        };

        const response = await fetch(`${this.ENDPOINTS.googleGemini}/models/${model}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini Text Analysis failed: ${err}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated";
        if (onProgress) onProgress(content, content.length);
        return content;
    },

    async askFollowUpGemini(question, conversationHistory, settings, onProgress) {
        const { textModel, geminiApiKey } = settings;
        const model = textModel || "gemini-2.0-flash-exp";

        // Gemini handles history differently (multi-turn chat), but we can construct content list
        // Note: Gemini roles are 'user' and 'model'. Our history uses 'assistant'.
        const contents = [];

        // Add system instruction if possible (Gemini 1.5 Pro support system_instruction)
        // For simplicity, we'll prepend to first user message or just rely on context

        let instructions = "You are a helpful AI assistant answering questions about a screenshot that was analyzed using OCR.";

        conversationHistory.forEach((msg, index) => {
            let role = msg.role === 'user' ? 'user' : 'model';
            let text = msg.content;

            if (index === 0 && role === 'user') {
                text = `${instructions}\n\n${text}`;
            }

            contents.push({
                role: role,
                parts: [{ text: text }]
            });
        });

        contents.push({
            role: 'user',
            parts: [{ text: question }]
        });

        const body = { contents: contents };

        const response = await fetch(`${this.ENDPOINTS.googleGemini}/models/${model}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini Follow-up failed: ${err}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated";
        if (onProgress) onProgress(content, content.length);
        return content;
    }

};

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIService;
}
