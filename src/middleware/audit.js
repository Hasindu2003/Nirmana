const { AuditLog } = require('../models');

const logAudit = async ({ userId, action, entityName, entityId, details, req }) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    await AuditLog.create({
      userId: userId || (req && req.user ? req.user.id : null),
      action,
      entityName,
      entityId: entityId ? entityId.toString() : null,
      details: typeof details === 'object' ? JSON.stringify(details) : details,
      ipAddress,
    });
  } catch (err) {
    console.error('AuditLog error:', err.message);
  }
};

module.exports = {
  logAudit,
};
