const os = require('os');

/**
 * Get all active external IPv4 network interfaces
 */
function getAvailableLanIps() {
  const nets = os.networkInterfaces();
  const list = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Look for non-internal IPv4
      if (net.family === 'IPv4' && !net.internal) {
        list.push({
          name,
          address: net.address,
        });
      }
    }
  }

  // Prioritize Wi-Fi, Ethernet, Wireless, WLAN
  list.sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();
    const isWifiA = aLower.includes('wi-fi') || aLower.includes('wlan') || aLower.includes('wireless');
    const isWifiB = bLower.includes('wi-fi') || bLower.includes('wlan') || bLower.includes('wireless');
    if (isWifiA && !isWifiB) return -1;
    if (!isWifiA && isWifiB) return 1;

    const isEthA = aLower.includes('ethernet');
    const isEthB = bLower.includes('ethernet');
    if (isEthA && !isEthB) return -1;
    if (!isEthA && isEthB) return 1;

    // Deprioritize virtual adapters like vEthernet, vmware, virtualbox, wsl
    const isVirtA = aLower.includes('vethernet') || aLower.includes('vm') || aLower.includes('vbox');
    const isVirtB = bLower.includes('vethernet') || bLower.includes('vm') || bLower.includes('vbox');
    if (!isVirtA && isVirtB) return -1;
    if (isVirtA && !isVirtB) return 1;

    return 0;
  });

  return list;
}

/**
 * Returns the best primary LAN IP for mobile access
 */
function getPrimaryLanIp() {
  const ips = getAvailableLanIps();
  return ips.length > 0 ? ips[0].address : null;
}

/**
 * Builds the best mobile-accessible upload URL based on request & network
 */
function getUploadUrl(req, port = 3000) {
  // 1. If explicit customer portal or app URL is configured, use it
  if (process.env.CUSTOMER_PORTAL_URL) {
    return process.env.CUSTOMER_PORTAL_URL;
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/$/, '')}/upload`;
  }

  const host = req && typeof req.get === 'function' ? (req.get('host') || '') : '';
  const hostname = host.split(':')[0];
  const reqPort = host.split(':')[1] || port;

  // 2. If running on Vercel or accessed via public cloud domain / non-local hostname
  if (host && !['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase())) {
    const proto = (req.headers && req.headers['x-forwarded-proto']) || req.protocol || 'https';
    return `${proto}://${host}/upload`;
  }

  // 3. If accessed locally (localhost / 127.0.0.1), use the Wi-Fi / LAN IP so phones on same network can access it
  if (['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase()) || !host) {
    const lanIp = getPrimaryLanIp();
    if (lanIp) {
      return `http://${lanIp}:${reqPort}/upload`;
    }
  }

  // 4. Default fallback
  return host ? `http://${host}/upload` : 'https://nirmana-upload.vercel.app';
}

module.exports = {
  getAvailableLanIps,
  getPrimaryLanIp,
  getUploadUrl,
};
