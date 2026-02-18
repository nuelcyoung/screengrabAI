# Changelog

All notable changes to ScreenGrab AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- [ ] Export results to PDF/Markdown
- [ ] Batch capture multiple areas
- [ ] Custom prompt templates
- [ ] Dark mode for results display
- [ ] Keyboard shortcuts
- [ ] Support for Firefox (WebExtension API)

---

## [1.1.0] - 2025-02-18

### Added
- Three capture modes: visible tab, full page, and area selection
- AI-powered OCR text extraction using vision models
- Contextual AI analysis with follow-up questions
- Local AI support via Ollama for offline, privacy-first operation
- Cloud provider support: OpenAI, Anthropic, Google Gemini, Google Cloud Vision
- Floating capture icon for quick access on any page
- Progress indicator with real-time status updates
- Markdown-formatted results with code blocks and tables
- SSN pattern redaction for privacy
- Settings page for API key and model configuration
- Automatic page stitching for full-page captures
- Rate limiting and retry logic for Chrome capture API

### Security
- All API keys stored locally in `chrome.storage.local`
- No telemetry, analytics, or tracking
- No data sent to developer servers
- Local Ollama mode operates completely offline

### Technical
- Built on Chrome Manifest V3
- Service worker architecture with storage-based communication
- Content scripts for capture UI (selector, progress indicator, floating icon)
- Modular AI service layer supporting multiple providers

---

## [1.0.0] - 2025-02-18

### Added
- Initial release of ScreenGrab AI
- Basic screenshot capture functionality
- Integration with Ollama local AI
- Chrome extension support

---

## [0.1.0] - 2025-02-XX

### Added
- Project inception
- Core architecture design
- Initial AI service integration

---

## Version History Summary

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2025-02-18 | Full feature set with multiple AI providers |
| 1.0.0 | 2025-02-18 | Initial stable release |
| 0.1.0 | TBD | Beta/Development phase |

---

## Upgrade Guide

### From 1.0.0 to 1.1.0

No breaking changes. Simply reload the extension:
1. Go to `chrome://extensions/`
2. Find "ScreenGrab AI"
3. Click the reload icon 🔄

---

## Breaking Changes

*None yet. This is the initial public release.*

---

## Migration Notes

If you were using the development version:
- Export your settings before upgrading (feature coming in v1.2.0)
- API keys are preserved in local storage automatically

---

[Unreleased]: https://github.com/nuelcyoung/screengrabAI/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/nuelcyoung/screengrabAI/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nuelcyoung/screengrabAI/commits/v1.0.0
[0.1.0]: https://github.com/nuelcyoung/screengrabAI/commits/v0.1.0
