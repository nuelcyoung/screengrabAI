# Contributing to ScreenGrab AI

First off, thank you for considering contributing to ScreenGrab AI! It's people like you that make open source such a great community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Adding Features](#adding-features)

---

## Code of Conduct

This project and everyone participating in it is governed by basic principles of respect and inclusivity. By participating, you are expected to uphold this standard. Please be respectful, constructive, and professional in all interactions.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Bug Report Template:**

```markdown
**Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - OS: [e.g. Windows 11, macOS 14.2]
 - Chrome Version: [e.g. 121.0.6167.85]
 - Extension Version: [e.g. 1.0.0]
 - AI Provider: [e.g. Ollama, OpenAI]

**Additional Context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful** to most users
- **List some examples** of how this feature would be used
- **Include mockups or screenshots** if applicable

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, descriptive commit messages
3. **Test your changes** thoroughly across different scenarios
4. **Update the README** if you've changed features or functionality
5. **Submit a pull request** with a clear description of changes

---

## Development Setup

### Prerequisites

- Google Chrome or Microsoft Edge browser
- Node.js (optional, for development tools)
- Git

### Local Development

1. **Clone your fork:**
   ```bash
   git clone https://github.com/your-username/screengrabAI.git
   cd screengrabAI
   ```

2. **Load extension in Chrome:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `screengrabAI` folder

3. **Make changes and reload:**
   - Edit files in your code editor
   - Go to `chrome://extensions/`
   - Click the reload icon 🔄 on the ScreenGrab AI card
   - Or use keyboard shortcut: `Ctrl+R` on the extensions page

### Testing AI Providers

**Local Ollama (Recommended for development):**
```bash
# Install Ollama
# Visit: https://ollama.com

# Pull vision model
ollama pull qwen2-vl:7b

# Pull text model
ollama pull llama3.2

# Run Ollama server
ollama serve
```

**Cloud Providers:**
- Get API keys from respective providers
- Add keys in extension Settings (⚙️)
- Test each provider separately

### Debugging

**Open DevTools:**
1. Go to `chrome://extensions/`
2. Find "ScreenGrab AI"
3. Click "Service worker" for background script logs
4. For popup/content script issues, right-click the popup and inspect

**Common Console Commands:**
```javascript
// Check capture state
chrome.storage.local.get('currentCapture', console.log)

// Clear all states
chrome.storage.local.clear()

// Check settings
chrome.storage.local.get('screengrabSettings', console.log)
```

---

## Coding Standards

### JavaScript Style

- Use **ES6+** features (async/await, arrow functions, etc.)
- **2 spaces** for indentation (no tabs)
- Use **single quotes** for strings
- **Semicolons** required
- **CamelCase** for variables and functions
- **PascalCase** for classes/constructors

```javascript
// Good
const captureScreenshot = async (tabId) => {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId);
    return dataUrl;
  } catch (error) {
    console.error('[Screenshot] Failed:', error);
    throw error;
  }
};

// Avoid
var capturescreenshot = function(tabid)
{
  // ...
}
```

### File Organization

Keep files focused and modular:

```
fileName.js
├── Constants (if any)
├── State variables
├── Helper functions
├── Main functions
└── Event listeners
```

### Comments

- Document complex logic with clear comments
- Use JSDoc for functions with parameters
- Keep comments up-to-date when code changes

```javascript
/**
 * Captures a screenshot of the visible tab
 * @param {number} tabId - The ID of the tab to capture
 * @returns {Promise<string>} Base64 encoded image data
 */
async function captureVisibleTab(tabId) {
  // Implementation...
}
```

---

## Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```bash
feat(capture): add area selection mode

Implements rectangular area selection for precise screenshot capture.
Users can now draw a rectangle to capture specific regions.

Closes #42

fix(ollama): handle connection timeout gracefully

Previously, if Ollama server wasn't responding, the extension
would hang indefinitely. Now it shows a user-friendly error message
after 30 seconds.

Fixes #38

docs(readme): update installation instructions

Added step-by-step guide for manual Chrome installation.
```

---

## Adding Features

### Feature Checklist

Before submitting a new feature:

- [ ] Feature is tested with multiple AI providers
- [ ] Works with all capture modes (visible, full page, area)
- [ ] Handles errors gracefully with user feedback
- [ ] README is updated if needed
- [ ] Code follows style guidelines
- [ ] No console errors or warnings
- [ ] Works on Chrome and Edge

### Adding a New AI Provider

1. **Add provider constant** in `ai-service.js`:
```javascript
PROVIDERS: {
  // ...
  NEW_PROVIDER: 'new-provider'
}
```

2. **Add endpoint** in `ENDPOINTS` object

3. **Implement API methods**:
```javascript
async describeImageNewProvider(base64Image, settings, onProgress) {
  // Implementation
}

async analyzeTextNewProvider(text, settings, onProgress) {
  // Implementation
}
```

4. **Update UI** in `options.html`:
```html
<option value="new-provider">New Provider</option>
```

5. **Update README.md** with provider setup instructions

---

## Questions?

Feel free to open an issue with the `question` label, or start a discussion!

---

**Thank you for your contributions! 🎉**
