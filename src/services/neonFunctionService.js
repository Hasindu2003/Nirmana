const config = require('../config/config');

function isConfigured() {
  return Boolean(config.neon.functions.helloBaseUrl);
}

/**
 * Invoke the deployed Neon 'hello' function
 */
async function invokeHello() {
  const baseUrl = config.neon.functions.helloBaseUrl;
  if (!baseUrl) {
    throw new Error('Neon Function HELLO is not configured');
  }

  const response = await fetch(baseUrl);
  if (!response.ok) {
    throw new Error(`Neon Function returned HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  return {
    status: response.status,
    url: baseUrl,
    output: text,
  };
}

module.exports = {
  isConfigured,
  invokeHello,
};
