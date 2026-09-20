// Nirmana Customer Portal Configuration
window.NIRMANA_CONFIG = {
  // Automatically points to local dev backend or live production backend
  API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '3000' ? '' : 'http://localhost:3000')
    : 'https://nirmana-iota.vercel.app',
};
