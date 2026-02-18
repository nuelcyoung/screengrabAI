# ScreenGrab AI

> AI-powered screenshot capture and analysis tool that runs locally on your machine.

Capture screenshots, extract text with OCR, and get AI-powered insights—without sending your data to the cloud.

![ScreenGrab AI](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)
![License](https://img.shields.io/badge/license-MIT-blue)
![Privacy](https://img.shields.io/badge/privacy-Local%20First-brightgreen)

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
  - Optional cloud providers: OpenAI, Anthropic, Google Gemini, Google Cloud Vision

- **User-Friendly**
  - Floating capture icon on every page for quick access
  - Progress indicator during analysis
  - Markdown-formatted results with tables, code blocks, and structured output

## 📸 Screenshots

> *[Coming soon - Demo of capture modes, UI, and AI analysis results]*

## 🚀 Installation

### Option 1: Install from Chrome Web Store (Coming Soon)

> Will be available once published.

### Option 2: Manual Installation (Recommended for Development)

1. **Download or Clone this Repository**
   ```bash
   git clone https://github.com/yourusername/screengrab.git
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
4. **Wait for AI analysis** — Progress indicator shows status
5. **View results** — Text extraction and AI insights displayed

### Follow-Up Questions

After capturing, you can ask follow-up questions about the content:
- "Summarize the key points"
- "What design patterns are mentioned?"
- "Extract all code examples"
- "Explain this section in simpler terms"

## ⚙️ Configuration

### Local AI (Ollama) — Recommended for Privacy

1. **Install Ollama**
   - Download from [ollama.com](https://ollama.com)
   - Works on macOS, Linux, and Windows

2. **Pull Vision Model** (for OCR)
   ```bash
   ollama pull qwen2-vl:7b
   # or any other vision model like llava, minicpm-v
   ```

3. **Pull Text Model** (for analysis)
   ```bash
   ollama pull llama3.2
   # or mistral, codellama, etc.
   ```

4. **Configure Extension**
   - Click extension icon → Settings (⚙️)
   - Select **Vision Provider: Ollama Local**
   - Select **Text Provider: Ollama Local**
   - Choose your models

### Cloud AI Providers (Optional)

If you prefer cloud-based models, configure these in Settings:

| Provider | Use Case | Get API Key |
|----------|----------|-------------|
| **Google Cloud Vision** | OCR (vision) | [Google Cloud Console](https://console.cloud.google.com) |
| **OpenAI** | Vision + Text | [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | Claude (text) | [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | Vision + Text | [ai.google.dev](https://ai.google.dev) |

**API Keys Security:**
- All keys are stored locally on your device
- Keys are never sent to any server other than the respective AI provider
- No data is routed through third-party intermediaries

## 🔒 Privacy & Security

### What Gets Stored
- **Screenshots** — Temporarily in memory during processing
- **API Keys** — Stored locally in `chrome.storage.local`
- **User Settings** — Stored locally on your device

### What Gets Shared
- **With Ollama (Local)** — Nothing. All processing happens on your machine.
- **With Cloud Providers** — Only the screenshot image data for analysis. No metadata, tracking, or user identifiers.

### What Does NOT Get Shared
- ❌ No analytics or tracking
- ❌ No user identification
- ❌ No data sent to developer servers
- ❌ No browsing history

### Compliance Notes
- SSN patterns are automatically redacted from extracted text
- Suitable for confidential documents, legal materials, and sensitive content (when using local Ollama)

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Extension:** Chrome Manifest V3
- **AI Integration:**
  - Ollama (local inference)
  - OpenAI API
  - Anthropic Claude API
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

- **Issues:** [GitHub Issues](https://github.com/yourusername/screengrab/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/screengrab/discussions)

---

<div align="center">

**Built with ❤️ for privacy-first AI**

If you find this useful, consider ⭐ starring the repository!

</div>
