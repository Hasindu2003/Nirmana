/**
 * Date & Time utilities configured for Sri Lanka (Asia/Colombo, UTC+05:30)
 */

const SRI_LANKA_TIMEZONE = 'Asia/Colombo';

/**
 * Returns a Date object
 */
function parseDate(date) {
  if (!date) return new Date();
  return typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
}

/**
 * Returns current date in Sri Lanka in YYYY-MM-DD format (e.g. "2026-09-21")
 */
function getSriLankaTodayString(date = new Date()) {
  const d = parseDate(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SRI_LANKA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Formats date into Sri Lankan localized string
 * e.g. "Sep 21, 2026" or "Monday, Sep 21, 2026"
 */
function formatSriLankaDate(date, options = {}) {
  if (!date) return '-';
  const d = parseDate(date);
  const defaultOptions = {
    timeZone: SRI_LANKA_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };
  return new Intl.DateTimeFormat('en-LK', defaultOptions).format(d);
}

/**
 * Formats time into Sri Lankan localized 12-hour string
 * e.g. "12:07 AM" or "04:30 PM"
 */
function formatSriLankaTime(date, options = {}) {
  if (!date) return '-';
  const d = parseDate(date);
  const defaultOptions = {
    timeZone: SRI_LANKA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  return new Intl.DateTimeFormat('en-LK', defaultOptions).format(d);
}

/**
 * Formats date and time into Sri Lankan localized string
 * e.g. "Sep 21, 2026, 12:07 AM"
 */
function formatSriLankaDateTime(date, options = {}) {
  if (!date) return '-';
  const d = parseDate(date);
  const defaultOptions = {
    timeZone: SRI_LANKA_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  return new Intl.DateTimeFormat('en-LK', defaultOptions).format(d);
}

/**
 * Returns Start of Day and End of Day Date objects in Sri Lanka timezone
 * accurately converted to UTC for Sequelize Op.gte and Op.lte queries.
 */
function getSriLankaDayBounds(date = new Date()) {
  const dateStr = getSriLankaTodayString(date);
  const startOfDay = new Date(`${dateStr}T00:00:00+05:30`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
  return { startOfDay, endOfDay, dateStr };
}

module.exports = {
  SRI_LANKA_TIMEZONE,
  getSriLankaTodayString,
  formatSriLankaDate,
  formatSriLankaTime,
  formatSriLankaDateTime,
  getSriLankaDayBounds,
};
