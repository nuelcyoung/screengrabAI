/**
 * ai-service-multimodal.js
 *
 * Unified multimodal analysis with redirect mode support.
 *
 * Two modes:
 * 1. API Mode: Sends image and prompt to AI provider APIs (requires API keys)
 * 2. Redirect Mode: Copies image to clipboard and opens provider's web interface
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS = Object.freeze({
  OPENAI: 'openai',
  GROK: 'grok',
  GEMINI: 'gemini',
  OLLAMA_LOCAL: 'ollama',
  OLLAMA_CLOUD: 'ollama-cloud',
});

// Redirect mode only supports ChatGPT and Grok
const CHAT_URLS = Object.freeze({
  openai: 'https://chat.openai.com/',
  grok: 'https://grok.com/',
});

// Provider name mapping for settings
const PROVIDER_NAME_MAP = Object.freeze({
  'openai': PROVIDERS.OPENAI,
  'grok': PROVIDERS.GROK,
  'google-gemini': PROVIDERS.GEMINI,
  'ollama': PROVIDERS.OLLAMA_LOCAL,
  'ollama-cloud': PROVIDERS.OLLAMA_CLOUD,
});

const ENDPOINTS = Object.freeze({
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
});

/**
 * Known multimodal capabilities per provider.
 * Prefer exact-match sets over substring heuristics so new model
 * releases don't silently get mis-classified.
 */
const MULTIMODAL_MODEL_IDS = Object.freeze({
  [PROVIDERS.OPENAI]: new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']),
  [PROVIDERS.GROK]: new Set(['grok-2-vision-1212']),
  [PROVIDERS.GEMINI]: new Set(['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']),
  // Ollama models are user-installed; use a suffix allowlist instead.
  [PROVIDERS.OLLAMA_LOCAL]: null,
  [PROVIDERS.OLLAMA_CLOUD]: null,
});

/**
 * Capability cache backed by chrome.storage.session.
 *
 * chrome.storage.session persists across Manifest V3 service worker
 * restarts (within the same browser session) unlike module-level
 * variables, which are wiped whenever the worker is suspended.
 *
 * Key format: "ollama_cap::<baseUrl>::<modelId>"
 * Value: true | false
 */
const CACHE_KEY_PREFIX = 'ollama_cap::';

async function getCachedCapability(baseUrl, modelId) {
  const key = `${CACHE_KEY_PREFIX}${baseUrl}::${modelId}`;
  try {
    const result = await chrome.storage.session.get(key);
    // Returns {} if key absent; undefined means not cached yet.
    return Object.prototype.hasOwnProperty.call(result, key)
      ? result[key]
      : undefined;
  } catch {
    // Storage API unavailable (e.g. unit test environment).
    return undefined;
  }
}

async function setCachedCapability(baseUrl, modelId, value) {
  const key = `${CACHE_KEY_PREFIX}${baseUrl}::${modelId}`;
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch {
    // Non-fatal — next call will just re-query.
  }
}


// ---------------------------------------------------------------------------
// Image normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Return a bare base64 string (no data-URI prefix).
 * Accepts both "data:image/png;base64,<data>" and raw base64.
 */
function stripDataUri(input) {
  if (typeof input !== 'string') throw new TypeError('Image must be a string');
  const idx = input.indexOf(',');
  return idx !== -1 ? input.slice(idx + 1) : input;
}

/**
 * Return a full data-URI string.
 * Accepts both data-URI and raw base64; defaults to image/png.
 */
function ensureDataUri(input, mimeType = 'image/png') {
  if (typeof input !== 'string') throw new TypeError('Image must be a string');
  return input.startsWith('data:') ? input : `data:${mimeType};base64,${input}`;
}

/**
 * Extract the mime type from a data-URI, defaulting to image/png.
 */
function mimeTypeFromDataUri(input) {
  const match = input.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
}


// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function buildHeaders(provider, apiKey) {
  const common = { 'Content-Type': 'application/json' };
  switch (provider) {
    case PROVIDERS.OPENAI:
    case PROVIDERS.GROK:
      return { ...common, Authorization: `Bearer ${apiKey}` };
    case PROVIDERS.OLLAMA_LOCAL:
    case PROVIDERS.OLLAMA_CLOUD:
      return apiKey ? { ...common, Authorization: `Bearer ${apiKey}` } : common;
    default:
      return common;
  }
}

function getOllamaBaseUrl(provider, settings) {
  if (provider === PROVIDERS.OLLAMA_CLOUD) {
    return settings.ollamaCloudUrl || 'https://your-cloud-ollama-host';
  }
  return settings.ollamaLocalUrl || 'http://localhost:11434';
}

/**
 * Centralised fetch wrapper — surfaces HTTP errors with body text
 * rather than swallowing them or returning an undefined-riddled object.
 */
async function apiFetch(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    throw new Error(`Network error reaching ${url}: ${networkError.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable body)');
    throw new Error(`HTTP ${response.status} from ${url}: ${body}`);
  }

  return response.json();
}


// ---------------------------------------------------------------------------
// Provider implementations (API mode)
// ---------------------------------------------------------------------------

/**
 * Each function:
 *   - accepts (base64Image, prompt, settings)
 *   - returns Promise<string>  (the model's text response)
 *   - throws a descriptive Error on failure
 */

async function analyzeOpenAI(base64Image, prompt, settings) {
  const { unifiedModel = 'gpt-4o', openaiApiKey } = settings;

  const data = await apiFetch(`${ENDPOINTS.openai}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(PROVIDERS.OPENAI, openaiApiKey),
    body: JSON.stringify({
      model: unifiedModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: ensureDataUri(base64Image) } },
          { type: 'text', text: prompt },
        ],
      }],
      max_tokens: 8192,
    }),
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error(`Unexpected OpenAI response shape: ${JSON.stringify(data)}`);
  }
  return text;
}

async function analyzeGrok(base64Image, prompt, settings) {
  const { unifiedModel = 'grok-2-vision-1212', grokApiKey } = settings;

  const data = await apiFetch(`${ENDPOINTS.grok}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(PROVIDERS.GROK, grokApiKey),
    body: JSON.stringify({
      model: unifiedModel,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: ensureDataUri(base64Image) } },
        ],
      }],
    }),
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error(`Unexpected Grok response shape: ${JSON.stringify(data)}`);
  }
  return text;
}

async function analyzeGemini(base64Image, prompt, settings) {
  const { unifiedModel = 'gemini-2.0-flash-exp', geminiApiKey } = settings;
  const bare = stripDataUri(base64Image);
  const mime = mimeTypeFromDataUri(base64Image);

  const url = `${ENDPOINTS.gemini}/models/${unifiedModel}:generateContent?key=${geminiApiKey}`;

  const data = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: bare } },
        ],
      }],
    }),
  });

  // Gemini can return multiple candidate parts; grab the first text block.
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.find(p => typeof p.text === 'string')?.text
    : undefined;

  if (typeof text !== 'string') {
    // Surface finish reason (e.g. SAFETY, RECITATION) if available.
    const reason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      reason
        ? `Gemini returned no text (finishReason: ${reason})`
        : `Unexpected Gemini response shape: ${JSON.stringify(data)}`
    );
  }
  return text;
}

async function analyzeOllama(base64Image, prompt, settings) {
  const { unifiedApiProvider, unifiedModel, ollamaApiKey } = settings;
  const baseUrl = getOllamaBaseUrl(unifiedApiProvider, settings);

  const data = await apiFetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(unifiedApiProvider, ollamaApiKey),
    body: JSON.stringify({
      model: unifiedModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: ensureDataUri(base64Image) } },
          { type: 'text', text: prompt },
        ],
      }],
      stream: false,
    }),
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`);
  }
  return text;
}


// ---------------------------------------------------------------------------
// Redirect mode implementation
// ---------------------------------------------------------------------------

/**
 * Redirect to provider's web interface with image copied to clipboard.
 * Bypasses API key requirement entirely.
 *
 * @param {string} base64Image - Data URI or base64 encoded image
 * @param {string} prompt - User's question/task for the AI
 * @param {object} settings - Extension settings
 * @returns {Promise<string>} Message indicating redirect happened
 */
async function redirectToProviderChat(base64Image, prompt, settings) {
  // Redirect mode supports ChatGPT and Grok.
  // Use the vision/text API provider to determine redirect destination.
  // Never infer from visionApiProvider/textApiProvider — those control API mode, not redirect mode.
  const apiProvider = settings.visionApiProvider || settings.textApiProvider || 'openai';

  // Map the API provider to the redirect provider
  // Only OpenAI and Grok support redirect mode
  const providerKey = (apiProvider === 'openai' || apiProvider === 'grok')
    ? apiProvider
    : 'openai'; // Default to OpenAI if provider doesn't support redirect

  const provider = PROVIDER_NAME_MAP[providerKey];

  if (!provider || !CHAT_URLS[provider]) {
    throw new Error(
      `Redirect mode only supports "openai" (ChatGPT) and "grok" (Grok). ` +
      `Got: "${providerKey}". Please select OpenAI or Grok as your API provider.`
    );
  }

  // Ensure we have a data URI
  const dataUri = ensureDataUri(base64Image);

  // Convert to blob for clipboard
  const imageBlob = await fetch(dataUri).then(r => r.blob());

  // Copy to clipboard
  try {
    const clipboardData = {
      [imageBlob.type]: imageBlob
    };

    // Note: We intentionally do NOT include text/plain here.
    // The prompt is typed separately via the injection script (lines 457-475).
    // Including text in the clipboard causes some providers to paste text instead of image.

    // Including an HTML representation often helps apps like Gemini correctly intercept and parse the image 
    // when a raw image blob might misbehave or be ignored.
    const htmlSnippet = `<img src="${dataUri}" alt="Screenshot for analysis" />`;
    clipboardData['text/html'] = new Blob([htmlSnippet], { type: 'text/html' });

    await navigator.clipboard.write([
      new ClipboardItem(clipboardData)
    ]);
  } catch (clipboardError) {
    console.warn('[ScreenGrab] Service worker clipboard write failed, relying on foreground tab injection instead:', clipboardError.message);
  }

  // Open the provider's chat URL
  const newTab = await chrome.tabs.create({ url: CHAT_URLS[provider] });
  const tabId = newTab.id;

  // Fetch blob in extension context (avoids CORS issues when fetching data URIs from external sites)
  // Convert to base64 since ArrayBuffer can't be JSON-serialized for executeScript
  let imageBase64;
  let imageBlobType;
  try {
    const res = await fetch(dataUri);
    const buffer = await res.arrayBuffer();
    imageBlobType = res.headers.get('content-type') || 'image/png';
    // Convert ArrayBuffer to base64 for JSON serialization
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    imageBase64 = btoa(binary);
    console.log('[ScreenGrab] Fetched and encoded image:', imageBase64.length, 'base64 chars, type:', imageBlobType);
  } catch (fetchErr) {
    console.error('[ScreenGrab] Failed to fetch/encode image:', fetchErr);
  }

  // Auto-paste injection logic
  let injected = false;
  const injectAutoPaste = async () => {
    if (injected) return;
    injected = true;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (base64Data, blobType, prmpt, prov) => {
          // Guard against duplicate injection - check if already ran
          if (window.__screengrabAutoPasted) {
            console.log('[ScreenGrab Auto-paste] Already executed, skipping');
            return;
          }
          window.__screengrabAutoPasted = true;

          console.log('[ScreenGrab Auto-paste] Starting for provider:', prov);

          const sleep = ms => new Promise(r => setTimeout(r, ms));

          // First, ensure the image is in clipboard BEFORE we look for elements
          try {
            // Decode base64 back to binary
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: blobType });
            const file = new File([blob], 'screenshot.png', { type: blobType });

            console.log('[ScreenGrab Auto-paste] Created file:', file.name, file.size, file.type, 'bytes');

            // Write ONLY the image to clipboard first (no text)
            const clipboardItem = new ClipboardItem({
              [blobType]: blob
            });

            await navigator.clipboard.write([clipboardItem]);
            console.log('[ScreenGrab Auto-paste] Image written to clipboard');

            // Wait a bit to ensure clipboard is ready
            await sleep(500);
          } catch (clipboardErr) {
            console.error('[ScreenGrab Auto-paste] Failed to write to clipboard:', clipboardErr);
          }

          // Now find and interact with the target element
          let targetElement = null;

          // Wait until the input box appears and is truly interactive
          for (let i = 0; i < 60; i++) {
            if (prov === 'openai') {
              targetElement = document.querySelector('#prompt-textarea');
              if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) break;
                targetElement = null;
              }
            } else if (prov === 'grok') {
              // Grok.com uses a textarea or contenteditable div
              // Try multiple selectors for Grok
              const selectors = [
                'textarea[placeholder*="ask" i]',
                'textarea[placeholder*="message" i]',
                'textarea[placeholder*="grok" i]',
                'textarea[data-testid*="prompt" i]',
                'textarea[data-testid*="input" i]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]',
                'textarea'
              ];

              for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                  const rect = el.getBoundingClientRect();
                  // Check if element is visible and has reasonable size
                  if (rect.width > 100 && rect.height > 30 &&
                      el.offsetParent !== null &&
                      !el.disabled &&
                      !el.readOnly) {
                    targetElement = el;
                    break;
                  }
                }
                if (targetElement) break;
              }

              if (targetElement) break;
            }
            if (targetElement && targetElement.offsetWidth > 0) break;
            await sleep(500);
          }

          if (!targetElement) {
            console.warn('[ScreenGrab Auto-paste] Could not find target input element after 30 seconds.');
            return;
          }

          console.log('[ScreenGrab Auto-paste] Found target element:', targetElement.tagName, targetElement.className);

          try {
            // Focus the element first
            targetElement.focus();
            await sleep(500);

            // If we have a prompt, check if text already exists to avoid duplication
            if (prmpt) {
              const currentText = targetElement.value || targetElement.textContent || '';
              if (currentText.includes(prmpt)) {
                console.log('[ScreenGrab Auto-paste] Prompt already present, skipping text insertion');
              } else {
                console.log('[ScreenGrab Auto-paste] Setting prompt text via native setter');
                try {
                  if ((prov === 'openai' || prov === 'grok') && targetElement.tagName === 'TEXTAREA') {
                    // ChatGPT and Grok both use textarea — native setter triggers React state update
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                    nativeSetter.call(targetElement, prmpt);
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                  } else if (targetElement.isContentEditable) {
                    // For contenteditable divs (Grok might use this)
                    targetElement.focus();
                    document.execCommand('insertText', false, prmpt);
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                  } else {
                    // Fallback for other input types
                    targetElement.textContent = prmpt;
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                } catch (textErr) {
                  console.warn('[ScreenGrab Auto-paste] Failed to set prompt text:', textErr);
                }
              }
              await sleep(400);
            }

            // Create DataTransfer object with the file for injection
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blobForInput = new Blob([bytes], { type: blobType });
            const file = new File([blobForInput], 'screenshot.png', { type: blobType });

            const dt = new DataTransfer();
            dt.items.add(file);

            // openai and grok both accept synthetic paste events
            console.log(`[ScreenGrab Auto-paste] Dispatching synthetic paste event for ${prov}`);
            try {
              // For Grok, try multiple paste approaches
              if (prov === 'grok') {
                // Approach 1: Try dispatching to the element directly
                const pasteEvent = new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dt
                });
                Object.defineProperty(pasteEvent, 'clipboardData', { value: dt, writable: false });

                // Focus the element before paste
                targetElement.focus();

                // Dispatch the paste event
                const pasteResult = targetElement.dispatchEvent(pasteEvent);

                // If paste was prevented or didn't work, try alternative approach
                if (!pasteResult) {
                  console.warn('[ScreenGrab Auto-paste] Paste event was prevented, trying file input approach');
                  // Try to find and use a file input element
                  const fileInputs = document.querySelectorAll('input[type="file"]');
                  for (const fileInput of fileInputs) {
                    if (fileInput.offsetParent !== null) {
                      // Create a new FileList with our file
                      const dataTransfer = new DataTransfer();
                      dataTransfer.items.add(file);
                      fileInput.files = dataTransfer.files;
                      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('[ScreenGrab Auto-paste] File input approach completed');
                      break;
                    }
                  }
                }
              } else {
                // Standard paste for OpenAI
                const pasteEvent = new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dt
                });
                Object.defineProperty(pasteEvent, 'clipboardData', { value: dt, writable: false });
                targetElement.dispatchEvent(pasteEvent);
              }
            } catch (e) {
              console.warn('[ScreenGrab Auto-paste] Could not create synthetic paste event:', e);
            }
            console.log('[ScreenGrab Auto-paste] Injection sequence complete!');
          } catch (e) {
            console.error('[ScreenGrab Auto-paste] Error during paste:', e);
          }
        },
        args: [imageBase64, imageBlobType, prompt, provider]
      });
    } catch (e) {
      console.warn('[ScreenGrab] Auto-paste injection failed:', e);
    }
  };

  chrome.tabs.onUpdated.addListener(function listener(tId, info) {
    if (tId === tabId && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      // Longer delay for Grok to ensure it's fully interactive
      const delay = provider === PROVIDERS.GROK ? 2000 : 1000;
      setTimeout(injectAutoPaste, delay);
    }
  });

  // Show notification with instructions
  const providerNames = {
    [PROVIDERS.OPENAI]: 'ChatGPT',
    [PROVIDERS.GROK]: 'Grok',
  };

  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon128.png'),
    title: '📋 Image Ready - ' + providerNames[provider],
    message: 'Image copied! Attempting auto-paste... If image doesn\'t appear, click in the chat box and press Ctrl+V to paste manually.',
    priority: 2,
  }).catch(() => {
    // Notifications not available, fallback to console
    console.log('[ScreenGrab] Image in clipboard - Click in the chat and press Ctrl+V to paste');
  });

  return `Redirected to ${providerNames[provider]}. Image is in your clipboard - click in the chat box and press Ctrl+V if auto-paste doesn't work.`;
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * analyzeImage (API mode)
 *
 * Send an image and a plain question/task to a multimodal model.
 * Returns the model's response as a string.
 *
 * The caller decides what the prompt says — this function does NOT
 * inject an OCR step or impose any output structure.
 *
 * @param {string}   base64Image  Raw base64 or data-URI encoded image.
 * @param {string}   prompt       The question or task for the model.
 * @param {object}   settings     Provider credentials and model selection.
 * @returns {Promise<string>}
 */
async function analyzeImage(base64Image, prompt, settings) {
  if (!base64Image) throw new Error('base64Image is required');
  if (!prompt) throw new Error('prompt is required');

  const provider = settings?.unifiedApiProvider;
  if (!provider) throw new Error('settings.unifiedApiProvider is required');

  switch (provider) {
    case PROVIDERS.OPENAI: return analyzeOpenAI(base64Image, prompt, settings);
    case PROVIDERS.GROK: return analyzeGrok(base64Image, prompt, settings);
    case PROVIDERS.GEMINI: return analyzeGemini(base64Image, prompt, settings);
    case PROVIDERS.OLLAMA_LOCAL:
    case PROVIDERS.OLLAMA_CLOUD: return analyzeOllama(base64Image, prompt, settings);
    default:
      throw new Error(
        `Unknown provider "${provider}". Valid providers: ${Object.values(PROVIDERS).join(', ')}`
      );
  }
}

/**
 * isMultimodalModel
 *
 * Returns true if the given model ID supports image input for the
 * given provider. Used to filter model dropdowns in the UI.
 *
 * For cloud providers this is a synchronous allowlist check.
 * For Ollama use queryOllamaModelIsMultimodal() instead — it asks
 * the running Ollama instance directly so arbitrary local models
 * (qwen3.5, future releases, custom fine-tunes) are handled correctly
 * without any name-pattern maintenance.
 *
 * @param {string} provider
 * @param {string} modelId
 * @returns {boolean}
 */
function isMultimodalModel(provider, modelId) {
  const allowlist = MULTIMODAL_MODEL_IDS[provider];
  if (allowlist === undefined) {
    throw new Error(`Unknown provider "${provider}"`);
  }
  if (allowlist === null) {
    // Ollama — caller must use queryOllamaModelIsMultimodal() for
    // authoritative capability detection.
    throw new Error(
      `Use queryOllamaModelIsMultimodal() for Ollama provider. ` +
      `Name-based heuristics cannot reliably identify vision models.`
    );
  }
  return allowlist.has((modelId || '').toLowerCase());
}

/**
 * queryOllamaModelIsMultimodal
 *
 * Asks the Ollama /api/show endpoint whether a model has vision
 * capability. Caches the result for the lifetime of the service worker.
 *
 * Ollama reports capabilities in two ways depending on version:
 *   - Newer (>=0.3):  response.capabilities array contains "vision"
 *   - Older:          response.details.families array contains a family
 *                     like "clip" which signals multimodal support
 *
 * @param {string}  modelId   e.g. "qwen2.5-vl:7b", "qwen3.5:latest"
 * @param {string}  baseUrl   e.g. "http://localhost:11434"
 * @param {string}  [apiKey]
 * @returns {Promise<boolean>}
 */
async function queryOllamaModelIsMultimodal(modelId, baseUrl, apiKey) {
  const cached = await getCachedCapability(baseUrl, modelId);
  if (cached !== undefined) return cached;

  let data;
  try {
    data = await apiFetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: apiKey
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    });
  } catch {
    // If Ollama is unreachable, assume text-only — don't crash the UI.
    await setCachedCapability(baseUrl, modelId, false);
    return false;
  }

  // Newer Ollama: explicit capabilities array.
  const hasVisionCapability =
    Array.isArray(data?.capabilities) &&
    data.capabilities.includes('vision');

  // Older Ollama: presence of a CLIP projector in the model families
  // indicates multimodal (image encoder) support.
  const hasClipFamily =
    Array.isArray(data?.details?.families) &&
    data.details.families.some(f => typeof f === 'string' && f.toLowerCase().includes('clip'));

  const result = hasVisionCapability || hasClipFamily;
  await setCachedCapability(baseUrl, modelId, result);
  return result;
}

/**
 * categorizeOllamaModels
 *
 * Async version of categorizeModels specifically for Ollama, since
 * capability detection requires a network call per model.
 *
 * @param {Array<{id: string, name?: string}>} models
 * @param {string}  baseUrl  e.g. "http://localhost:11434"
 * @param {string}  [apiKey]
 * @returns {Promise<{ multimodal: Array, textOnly: Array }>}
 */
async function categorizeOllamaModels(models, baseUrl, apiKey) {
  const results = await Promise.allSettled(
    models.map(model =>
      queryOllamaModelIsMultimodal(model.id, baseUrl, apiKey)
        .then(isVision => ({ model, isVision }))
    )
  );

  const multimodal = [];
  const textOnly = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { model, isVision } = result.value;
      (isVision ? multimodal : textOnly).push(model);
    }
    // Rejected means the /api/show call threw unexpectedly after our
    // try/catch — treat as text-only rather than dropping the model.
    else {
      const idx = results.indexOf(result);
      textOnly.push(models[idx]);
    }
  }

  return { multimodal, textOnly };
}

/**
 * categorizeModels
 *
 * Splits a flat list of model objects into { multimodal, textOnly }
 * for cloud providers (synchronous allowlist check).
 *
 * For Ollama use categorizeOllamaModels() — it queries the running
 * instance so arbitrary local models are handled correctly.
 *
 * @param {Array<{id: string, name?: string}>} models
 * @param {string} provider  Must not be an Ollama provider.
 * @returns {{ multimodal: Array, textOnly: Array }}
 */
function categorizeModels(models, provider) {
  if (provider === PROVIDERS.OLLAMA_LOCAL || provider === PROVIDERS.OLLAMA_CLOUD) {
    throw new Error('Use categorizeOllamaModels() for Ollama providers.');
  }

  const multimodal = [];
  const textOnly = [];

  for (const model of models) {
    if (isMultimodalModel(provider, model.id)) {
      multimodal.push(model);
    } else {
      textOnly.push(model);
    }
  }

  return { multimodal, textOnly };
}


// ---------------------------------------------------------------------------
// background.js integration point
// ---------------------------------------------------------------------------

// sanitizeSensitiveData is imported from utils.js (via background.js importScripts)

/**
 * analyzeScreenshot
 *
 * Main entry point for screenshot analysis with redirect mode support.
 *
 * Modes:
 * 1. Redirect mode: Copies image to clipboard, opens provider's web interface
 *    Returns: HTML string with instructions
 *
 * 2. API mode with unified model: Image + prompt sent together to multimodal model
 *    Returns: Plain text string (no markdown)
 *
 * 3. Dual-model fallback (legacy): Two-step pipeline (OCR → text analysis)
 *    Returns: HTML string formatted by formatResult()
 *
 * @param {string}   base64Image
 * @param {object}   settings
 * @param {string}   tabId
 * @param {function} updateProgress  (step, pct, label, detail) => void
 * @returns {Promise<string>}  Final result text for display.
 */
async function analyzeScreenshot(base64Image, settings, tabId, updateProgress) {
  const {
    useRedirectMode,
    visionApiProvider,
    textApiProvider,
    useUnifiedModel,
    unifiedApiProvider,
    unifiedModel,
    captureGoal
  } = settings;

  console.log('[analyzeScreenshot] Mode selection:', {
    useRedirectMode,
    useUnifiedModel,
    unifiedApiProvider,
    unifiedModel,
    visionApiProvider,
    textApiProvider,
    hasAIService: typeof AIService !== 'undefined'
  });

  // Redirect mode: Open provider website with image copied to clipboard
  if (useRedirectMode) {
    await updateProgress(tabId, 1, 50, 'Opening AI Provider', 'Copying image to clipboard...');

    const prompt = captureGoal?.trim() || 'Describe what you see in this image and highlight anything noteworthy.';

    const result = await redirectToProviderChat(base64Image, prompt, settings);

    await updateProgress(tabId, 1, 100, 'Done', 'Opened provider website');

    // Return a user-friendly message indicating redirect happened
    return `
      <div style="padding: 20px;">
        <h2 style="color: #10b981; margin-top: 0;">✓ ${result}</h2>
        <p style="font-size: 16px;"><strong>What happens next:</strong></p>
        <ol style="line-height: 2;">
          <li>✓ A new tab has opened with the AI provider</li>
          <li>✓ The <strong>image</strong> has been copied to your clipboard</li>
          <li>✓ Auto-paste will attempt to paste the image</li>
          <li><strong style="color: #e11d48;">⚠️ If you only see text (no image), click in the chat box and press <kbd style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 6px; font-size: 16px; font-weight: bold;">Ctrl+V</kbd></strong></li>
        </ol>
        <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <strong style="color: #1e40af !important; ">💡 Your prompt:</strong><br/>
          <em style="color: #3b82f6 !important;">"${prompt}"</em>
        </div>
        <p style="margin-top: 15px; color: #666; font-size: 14px;">
          The image is ready in your clipboard. Switch to the newly opened tab and press Ctrl+V if needed.
        </p>
      </div>
    `;
  }

  // API mode with unified model
  if (useUnifiedModel && unifiedApiProvider && unifiedModel) {
    const prompt = captureGoal?.trim()
      || 'Describe what you see in this image and highlight anything noteworthy.';

    await updateProgress(tabId, 1, 10, 'Analysing', 'Sending to model…');

    const result = await analyzeImage(base64Image, prompt, settings);

    await updateProgress(tabId, 1, 100, 'Done', `${result.length.toLocaleString()} chars`);

    return sanitizeSensitiveData(result);
  }

  // Dual-model fallback — legacy pipeline using AIService from ai-service.js
  // Note: This is the original two-step pipeline (OCR → text analysis)
  // There is no separate analyzeWithDualModels() function - this logic is inline here
  if (typeof AIService !== 'undefined') {
    console.log('[analyzeScreenshot] Using dual-model fallback with AIService');

    // Vision OCR
    let imageDescription;
    try {
      await updateProgress(tabId, 1, 33, 'Analyzing', 'Vision Analysis');
      console.log('[analyzeScreenshot] Starting vision analysis with provider:', visionApiProvider);
      imageDescription = await AIService.describeImage(base64Image, settings, (chunk, totalChars) => {
        updateProgress(tabId, 1, 33 + (totalChars / 1000) * 10, 'Analyzing', `${totalChars.toLocaleString()} chars`);
      });
      console.log('[analyzeScreenshot] Vision analysis complete, length:', imageDescription?.length);
    } catch (visionError) {
      console.error('[analyzeScreenshot] Vision analysis failed:', visionError);
      throw new Error(`Vision analysis failed: ${visionError.message}`);
    }

    imageDescription = sanitizeSensitiveData(imageDescription);

    // Check if cancelled before text analysis
    // Note: We'd need access to CaptureQueue for this, but for now we'll skip it
    // since this is the fallback path

    // Text Analysis
    let deepAnalysis;
    try {
      await updateProgress(tabId, 2, 66, 'Analyzing', 'Deep Analysis');
      console.log('[analyzeScreenshot] Starting text analysis with provider:', textApiProvider);
      deepAnalysis = await AIService.analyzeText(imageDescription, settings, (chunk, totalChars) => {
        updateProgress(tabId, 2, 66 + (totalChars / 1000) * 15, 'Analyzing', `${totalChars.toLocaleString()} chars`);
      });
      console.log('[analyzeScreenshot] Text analysis complete, length:', deepAnalysis?.length);
      deepAnalysis = sanitizeSensitiveData(deepAnalysis);
    } catch (error) {
      console.error('[analyzeScreenshot] Text analysis failed:', error);
      deepAnalysis = `Analysis unavailable: ${error.message}`;
    }

    const result = formatResult(imageDescription, deepAnalysis);
    console.log('[analyzeScreenshot] Dual-model analysis complete, result length:', result?.length);
    return result;
  }

  console.error('[analyzeScreenshot] No valid analysis mode configured!');
  console.error('[analyzeScreenshot] Settings:', {
    useRedirectMode,
    useUnifiedModel,
    unifiedApiProvider,
    unifiedModel,
    visionApiProvider,
    textApiProvider,
    hasAIService: typeof AIService !== 'undefined'
  });
  throw new Error('No valid analysis mode configured. Please enable redirect mode or configure API keys.');
}

/**
 * Format the final result from dual-model mode.
 *
 * This function is called by the dual-model fallback path in analyzeScreenshot()
 * (not by redirect mode or unified model mode).
 *
 * NOTE: parseMarkdown is imported from utils.js via background.js importScripts
 * Do NOT use globalThis.formatResult to avoid circular reference issues.
 *
 * @param {string} visionResult - OCR text extraction from first step
 * @param {string} analysisResult - AI analysis from second step
 * @returns {string} Formatted HTML result
 */
function formatResult(visionResult, analysisResult) {
  // Check if parseMarkdown is available (imported from utils.js via background.js)
  if (typeof parseMarkdown === 'function') {
    const descHtml = parseMarkdown(visionResult);
    const analysisHtml = parseMarkdown(analysisResult);
    return `${descHtml}${analysisHtml}`;
  }
  // Fallback to simple formatting
  return `${visionResult}\n\n---\n\nDeep Analysis:\n${analysisResult}`;
}


// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// CommonJS
if (typeof module !== 'undefined') {
  module.exports = {
    analyzeImage,
    analyzeScreenshot,
    isMultimodalModel,
    categorizeModels,
    categorizeOllamaModels,
    queryOllamaModelIsMultimodal,
    redirectToProviderChat,
    PROVIDERS,
  };
}

// ES module (commented out, uncomment if using ES modules)
// export {
//   analyzeImage, analyzeScreenshot,
//   isMultimodalModel, categorizeModels,
//   categorizeOllamaModels, queryOllamaModelIsMultimodal,
//   redirectToProviderChat,
//   PROVIDERS,
// };
