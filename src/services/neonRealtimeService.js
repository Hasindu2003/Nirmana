const config = require('../config/config');

let realtime = null;
let realtimeModule = null;

function isConfigured() {
  return Boolean(config.neon.realtime.url && config.neon.realtime.secret);
}

async function loadRealtimeModule() {
  if (realtimeModule) return realtimeModule;
  try {
    realtimeModule = require('@neon/realtime/server');
  } catch (err) {
    realtimeModule = await import('@neon/realtime/server');
  }
  return realtimeModule;
}

async function getRealtimeServer() {
  if (realtime) return realtime;
  const secret = config.neon.realtime.secret;
  if (!secret) return null;

  try {
    const mod = await loadRealtimeModule();
    const createRealtime = mod.createRealtime || (mod.default && mod.default.createRealtime);
    if (!createRealtime) {
      throw new Error('createRealtime is not exported from @neon/realtime/server');
    }
    realtime = createRealtime({
      secret: secret,
      db: 'neondb',
    });
    return realtime;
  } catch (err) {
    console.warn('Warning: Could not initialize @neon/realtime/server:', err.message);
    throw err;
  }
}

/**
 * Seals a live query so browser clients can subscribe via WebSocket safely
 */
async function sealLiveOrdersQuery(limit = 20) {
  const secret = config.neon.realtime.secret;
  if (!secret) {
    throw new Error('Neon Realtime is not configured (missing NEON_REALTIME_SECRET)');
  }

  const rt = await getRealtimeServer();
  if (!rt) {
    throw new Error('Neon Realtime server failed to initialize');
  }

  const mod = await loadRealtimeModule();
  const rawSql = mod.rawSql || (mod.default && mod.default.rawSql);
  if (!rawSql) {
    throw new Error('rawSql is not exported from @neon/realtime/server');
  }

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

