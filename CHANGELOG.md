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

## [2.1.0] - 2026-03-14

### Fixed
- **Area Selection:** Fixed double-click issue — area selection now works on first click
- **Ollama Models:** Fixed model dropdown showing "No models found" — models now properly load for Ollama Local and Ollama Cloud
- **Follow-up Questions:** Fixed markdown rendering in follow-up responses

### Improved
- **Area Selection:** Added 400ms grace period after overlay appears to prevent accidental clicks from popup closure
- **Architecture:** Storage-based capture queue for more reliable operation when browser suspends background processes
- **Progress Indicator:** Floating progress indicator with real-time status updates (capturing → selecting → processing → analyzing → complete)
- **User Feedback:** Clearer status messages during each capture phase

### Changed
- **Redirect Mode:** Updated description to clarify it "Opens the AI provider's website... Uses your own logged-in session"
- **Provider Naming:** Standardized provider IDs (`ollama_local`, `ollama_cloud`) for consistency

### Technical
- Fixed provider normalization in `getModels()` to handle legacy provider aliases
- Fixed `categorizeModels()` await and property name (`multimodal` vs `visionModels`)
- Removed redundant storage wipe in floating icon capture flow
- Added 350ms delay before area selector instantiation to avoid phantom events

---

## [2.0.0] - 2026-03-01

### Added
- **Grok (xAI) Provider:** Full support for Grok-2 Vision and text analysis
- **Redirect Mode:** Open screenshots directly in ChatGPT or Grok web interface
- **Auto-paste:** Automatic clipboard paste for Redirect Mode
- **In-page Results:** Result display panel with follow-up question support
- **Floating Progress:** Real-time progress indicator during capture and analysis

### Changed
- **Provider Removed:** Anthropic (Claude) provider support removed
- **Redirect Behavior:** Analysis result panel no longer shown when Redirect Mode is enabled
- **Default Provider:** Redirect Mode now uses selected API provider instead of hardcoded OpenAI

### Technical
- Added `ai-service-multimodal.js` for unified multimodal analysis
- Improved storage-based communication for follow-up questions
- Enhanced rate limiting for full-page captures

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
| 2.1.0 | 2026-03-14 | Bug fixes: area selection, Ollama models, markdown rendering |
| 2.0.0 | 2026-03-01 | Grok provider, Redirect Mode, in-page results |
| 1.0.0 | 2025-02-18 | Initial stable release |

---

## Upgrade Guide

### From 2.0.0 to 2.1.0

No breaking changes. Simply reload the extension:
1. Go to `chrome://extensions/`
2. Find "ScreenGrab AI"
3. Click the reload icon 🔄

Your settings and API keys are preserved automatically.

### From 1.x.x to 2.x.x

**Note:** Anthropic (Claude) provider was removed in v2.0.0. If you were using Claude:
1. Export your settings first (Settings → Export)
2. Edit the JSON file to change `"textApiProvider": "anthropic"` to `"textApiProvider": "ollama"` or another provider
3. Re-import the modified settings

All other settings and API keys are preserved automatically.

---

## Breaking Changes

### Version 2.0.0
- **Anthropic (Claude) provider removed** — If you were using Claude, you'll need to switch to another provider (Ollama, OpenAI, Grok, or Google Gemini)

*No other breaking changes.*

---

## Migration Notes

### Upgrading to 2.1.0
No migration needed. All settings and API keys are preserved automatically.

### Upgrading to 2.0.0
If you were using Anthropic (Claude):
1. Export your settings before upgrading (Settings → Export)
2. After upgrading, edit the exported JSON to change `"visionApiProvider"` and `"textApiProvider"` from `"anthropic"` to your new preferred provider
3. Re-import the modified settings

All other settings and API keys are preserved automatically.

---

[Unreleased]: https://github.com/nuelcyoung/screengrab/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/nuelcyoung/screengrab/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/nuelcyoung/screengrab/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/nuelcyoung/screengrab/commits/v1.0.0
