const { normalizeRole, isAdmin, isStaff, ROLES } = require('../constants/roles');

// Role-based access control middleware following SOLID principles
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }
      return res.redirect('/login');
    }

    const userRole = normalizeRole(req.user.role);

    // ADMIN (Owner) has full access across all operational resources
    if (isAdmin(userRole)) {
      return next();
    }

    // Check if worker/staff is permitted
    const allowsWorker = allowedRoles.some(r => {
      const n = normalizeRole(r);
      return n === ROLES.WORKER || r === 'STAFF';
    });

    if (allowsWorker && isStaff(userRole)) {
      return next();
    }

    const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));
    if (normalizedAllowed.includes(userRole) || allowedRoles.includes(req.user.role)) {
      return next();
    }

    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource. Required: [${allowedRoles.join(', ')}]`,
      });
    }

    return res.status(403).render('error', {
      title: 'Access Denied',
      message: `You do not have permission to access this area (${req.user.role}).`,
      statusCode: 403,
    });
  };
};

module.exports = {
  requireRole,
};
