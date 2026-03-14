
// Generate a random ID with a given prefix
function generateRandomId(prefix = '') {
  const randomString = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${randomString}` : randomString;
}

// Parse markdown to HTML
function parseMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Escape HTML first, but preserve markdown
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (must be before other processing)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');

  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Blockquotes
  html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^\*\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>');

  // Line breaks and paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Sanitize sensitive data patterns (optional privacy feature)
// Only redacts obvious SSN patterns - can be extended for other PII
function sanitizeSensitiveData(data) {
  if (typeof data === 'string') {
    // Redact SSN patterns: ###-##-####
    data = data.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  }
  return data;
}

/**
 * Format the final result from dual-model mode.
 * 
 * @param {string} visionResult - OCR text extraction from first step
 * @param {string} analysisResult - AI analysis from second step
 * @returns {string} Formatted HTML result
 */
function formatResult(visionResult, analysisResult) {
  // Check if parseMarkdown is available
  if (typeof parseMarkdown === 'function') {
    const descHtml = parseMarkdown(visionResult);
    const analysisHtml = parseMarkdown(analysisResult);
    return `${descHtml}${analysisHtml}`;
  }
  // Fallback to simple formatting
  return `${visionResult}\n\n---\n\nDeep Analysis:\n${analysisResult}`;
}

// Export for different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandomId,
    parseMarkdown,
    escapeHtml,
    sanitizeSensitiveData,
    formatResult
  };
}
