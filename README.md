# ScreenGrab AI

> AI-powered screenshot capture and analysis tool that runs locally on your machine.

Capture screenshots, extract text with OCR, and get AI-powered insights—without sending your data to the cloud.

![ScreenGrab AI](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)
![License](https://img.shields.io/badge/license-MIT-blue)
![Privacy](https://img.shields.io/badge/privacy-Local%20First-brightgreen)
![Version](https://img.shields.io/badge/version-2.1.0-blue)

## ✨ Features

- **Multiple Capture Modes**
  - 📸 **Visible Tab** — Capture what's currently on screen
  - 📄 **Full Page** — Auto-scrolls and stitches the entire page
  - ✂️ **Area Selection** — Draw a rectangle to capture a specific region

- **AI-Powered Analysis**
  - OCR text extraction from screenshots
  - Contextual understanding and analysis
  - Follow-up questions for deeper exploration

- **Privacy-First Architecture**
  - Run AI models locally via [Ollama](https://ollama.com) — works completely offline
  - No data leaves your device
  - Optional cloud providers: OpenAI, Grok, Google Gemini, Google Cloud Vision

- **Redirect Mode**
  - Open screenshots directly in ChatGPT or Grok's web interface
  - Image automatically copied to clipboard
  - Auto-paste functionality for seamless workflow

- **User-Friendly**
  - Floating capture icon on every page for quick access
  - Floating progress indicator during analysis
  - Markdown-formatted results with tables, code blocks, and structured output
  - In-page result display with follow-up question support

## 📸 Screenshots

> *[Coming soon - Demo of capture modes, UI, and AI analysis results]*

## 🚀 Installation

### Option 1: Install from Chrome Web Store (Coming Soon)

> Will be available once published.

### Option 2: Manual Installation (Recommended for Development)

1. **Download or Clone this Repository**
   ```bash
   git clone https://github.com/nuelcyoung/screengrab.git
   cd screengrab
   ```

2. **Open Chrome Extension Management**
   - In Google Chrome, navigate to `chrome://extensions/`
   - Or: Chrome Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the **"Developer mode"** switch in the top-right corner

4. **Load the Extension**
   - Click the **"Load unpacked"** button
   - Select the `screengrab` folder (the folder containing `manifest.json`)

5. **Verify Installation**
   - You should see "ScreenGrab AI" in your extensions list
   - The extension icon will appear in your Chrome toolbar

## 📖 Usage

### Basic Workflow

1. **Open any webpage** you want to capture
2. **Click the extension icon** or use the floating icon on the page
3. **Choose a capture mode:**
   - **Visible** — Capture what you see
   - **Full Page** — Capture the entire page (auto-scrolls)
   - **Select Area** — Draw a rectangle around what you want
4. **Wait for AI analysis** — Floating progress indicator shows real-time status
5. **View results** — Text extraction and AI insights displayed in-page with follow-up question support

### Follow-Up Questions

After capturing, you can ask follow-up questions about the content:
- "Summarize the key points"
- "What design patterns are mentioned?"
- "Extract all code examples"
- "Explain this section in simpler terms"

### Redirect Mode

Enable Redirect Mode in Settings to:
1. Take a screenshot and automatically open the provider's website (OpenAI ChatGPT or Grok) with the image in your clipboard
2. No API keys required — uses your existing logged-in session
3. The image is automatically copied to clipboard and attempts to paste into the chat interface

**Note:** When Redirect Mode is enabled, no analysis result panel is shown in-page since the provider handles analysis in their web interface.

## ⚙️ Configuration

### Local AI (Ollama) — Recommended for Privacy

1. **Install Ollama**
   - Download from [ollama.com](https://ollama.com)
   - Works on macOS, Linux, and Windows (native support for Apple Silicon)

2. **Pull Vision Model** (for OCR)
   ```bash
   ollama pull qwen3-vl:4b
   # or any other vision model like llava, minicpm-v, moondream
   ```

3. **Pull Text Model** (for analysis)
   ```bash
   ollama pull qwen3-coder:480b-cloud
   # or llama3, mistral, codellama, deepseek-coder, etc.
   ```

4. **Configure Extension**
   - Click extension icon → Settings (⚙️)
   - Select **Vision Provider: Ollama (Local)**
   - Select **Text Provider: Ollama (Local)**
   - Choose your models from the dropdown

> **Tip:** Ollama model names are case-sensitive. Use exact names as shown in `ollama list`.

### Cloud AI Providers (Optional)

If you prefer cloud-based models, configure these in Settings:

| Provider | Use Case | Get API Key |
|----------|----------|-------------|
| **Ollama Cloud** | Vision + Text | [ollama.com](https://ollama.com) |
| **OpenAI** | Vision + Text | [platform.openai.com](https://platform.openai.com) |
| **Grok (xAI)** | Vision + Text | [console.x.ai](https://console.x.ai) |
| **Google Gemini** | Vision + Text | [ai.google.dev](https://ai.google.dev) |
| **Google Cloud Vision** | OCR (vision only) | [Google Cloud Console](https://console.cloud.google.com) |

**API Keys Security:**
- All keys are stored locally in your browser via `chrome.storage.local`
- Keys are only sent to the respective provider's API endpoints
- No data is routed through third-party intermediaries or developer servers

### Redirect Mode Setup

1. Enable "Redirect Mode" in Settings
2. Select OpenAI or Grok as your Vision Provider (web providers only)
3. Take a screenshot — it will automatically open the provider's website with the image in your clipboard
4. The image attempts to auto-paste into the chat interface, or you can paste manually (Ctrl/Cmd+V)

> **Note:** Redirect Mode works with your existing browser session — no API keys needed. Just make sure you're already logged in to the provider's website.

## 🔒 Privacy & Security

### What Gets Stored
- **Screenshots** — Temporarily in browser memory during processing, then discarded
- **API Keys** — Stored locally in `chrome.storage.local` (encrypted by Chrome)
- **User Settings** — Stored locally on your device
- **Conversation History** — Temporarily held in-page memory for follow-up questions

### What Gets Shared
- **With Ollama (Local)** — Nothing. All processing happens on your machine via `localhost:11434`.
- **With Ollama Cloud** — Screenshot image sent directly to `ollama.com` API endpoints.
- **With Cloud Providers** — Only the screenshot image data for analysis. No metadata, browsing history, or user identifiers.
- **With Redirect Mode** — Screenshot is copied to your clipboard and the provider's website opens in a new tab. The extension doesn't send any data directly.

### What Does NOT Get Shared
- ❌ No analytics or tracking
- ❌ No user identification or telemetry
- ❌ No data sent to developer servers
- ❌ No browsing history or tab contents (only captured screenshot)
- ❌ No data shared with third parties beyond your chosen AI provider

### Compliance Notes
- SSN patterns are automatically redacted from extracted text
- Suitable for confidential documents, legal materials, and sensitive content (when using local Ollama)

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Extension:** Chrome Manifest V3
- **AI Integration:**
  - Ollama (local inference)
  - OpenAI API
  - Grok API (xAI)
  - Google Gemini API
  - Google Cloud Vision API

## 🏗️ Development

### Project Structure
```
screengrab/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── popup.js/html          # Extension popup UI
├── options.js/html        # Settings page
├── ai-service.js          # AI API client
├── ai-service-multimodal.js  # Multimodal + redirect mode
├── capture-queue.js       # Capture state management
├── selector.js            # Area selection UI
├── result-display.js      # Results display component
├── floating-icon.js       # Floating capture button
├── progress-indicator.js  # Progress UI
└── utils.js               # Helper functions
```

### Building for Production

1. Update version in `manifest.json`
2. Test all capture modes and AI providers
3. Package the extension folder
4. Submit to Chrome Web Store

## 🔄 Version History

### Version 2.1.0 (March 2026)
- **Fixed:** Area selection now works on first click (no double-click required)
- **Fixed:** Ollama models now properly load and display in the model dropdown
- **Fixed:** Follow-up questions now render markdown correctly
- **Improved:** Area selection overlay now has 400ms grace period to prevent accidental clicks
- **Improved:** Storage-based queue architecture for more reliable capture processing
- **Improved:** Floating progress indicator with real-time status updates
- **Changed:** Redirect Mode description clarified — "Opens the AI provider's website... Uses your own logged-in session"

### Version 2.0.0 (March 2026)
- **Added:** Grok (xAI) provider support
- **Removed:** Anthropic (Claude) provider
- **Fixed:** Redirect mode no longer shows Analysis Result panel
- **Improved:** Auto-paste functionality for Grok
- **Changed:** Default redirect provider to use selected API provider

### Version 1.1.0
- Initial public release

## 🤝 Contributing

Contributions are welcome! Here's how to help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Ideas
- [ ] Support for more AI providers
- [ ] Export results to PDF/Markdown
- [ ] Batch capture multiple areas
- [ ] Custom prompt templates
- [ ] Dark mode for results display
- [ ] Keyboard shortcuts

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.com) — Local AI inference
- Chrome Extension Documentation
- The open-source AI community

## 📧 Contact

- **Issues:** [GitHub Issues](https://github.com/nuelcyoung/screengrab/issues)
- **Discussions:** [GitHub Discussions](https://github.com/nuelcyoung/screengrab/discussions)

---

<div align="center">

**Built with ❤️ for privacy-first AI**

If you find this useful, consider ⭐ starring the repository!

</div>
