const config = require('../config/config');

let realtime = null;

function isConfigured() {
  return Boolean(config.neon.realtime.url && config.neon.realtime.secret);
}

function getRealtimeServer() {
  if (realtime) return realtime;
  const secret = config.neon.realtime.secret;
  if (!secret) return null;

  try {
    const { createRealtime } = require('@neon/realtime/server');
    realtime = createRealtime({
      secret: secret,
      db: 'neondb',
    });
    return realtime;
  } catch (err) {
    console.warn('Warning: Could not initialize @neon/realtime/server:', err.message);
    return null;
  }
}

/**
 * Seals a live query so browser clients can subscribe via WebSocket safely
 */
async function sealLiveOrdersQuery(limit = 20) {
  const rt = getRealtimeServer();
  if (!rt) {
    throw new Error('Neon Realtime is not configured (missing NEON_REALTIME_SECRET)');
  }

  const { rawSql } = require('@neon/realtime/server');
  const query = rawSql(
    `SELECT id, "orderNumber", status, "totalAmount", "balanceAmount", "createdAt" FROM orders ORDER BY id DESC LIMIT ${parseInt(limit, 10) || 20}`
  );

  const sealed = await rt.seal({ query });
  return {
    realtimeUrl: config.neon.realtime.url,
    sealed,
  };
}

module.exports = {
  isConfigured,
  getRealtimeServer,
  sealLiveOrdersQuery,
};
