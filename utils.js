
// Generate a random ID with a given prefix
function generateRandomId(prefix = '') {
  const randomString = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${randomString}` : randomString;
}

// Export for different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandomId
  };
}