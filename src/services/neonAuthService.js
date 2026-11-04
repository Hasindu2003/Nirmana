const config = require('../config/config');

function isConfigured() {
  return Boolean(config.neon.auth.baseUrl && config.neon.auth.jwksUrl);
}

/**
 * Fetch and verify JWKS from Neon Auth endpoint
 */
async function getAuthStatus() {
  const { baseUrl, jwksUrl } = config.neon.auth;
  if (!baseUrl || !jwksUrl) {
    return {
      configured: false,
      message: 'Neon Auth is not configured in environment',
    };
  }

  try {
    const res = await fetch(jwksUrl);
    if (!res.ok) {
      throw new Error(`JWKS endpoint returned HTTP ${res.status}`);
    }
    const jwks = await res.json();
    return {
      configured: true,
      provider: 'better_auth',
      baseUrl,
      jwksUrl,
      keyCount: Array.isArray(jwks.keys) ? jwks.keys.length : 0,
      status: 'ACTIVE',
    };
  } catch (err) {
    return {
      configured: true,
      baseUrl,
      jwksUrl,
      error: err.message,
      status: 'UNREACHABLE',
    };
  }
}

module.exports = {
  isConfigured,
  getAuthStatus,
};

