// Role-based access control middleware
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Unauthenticated.' });
      }
      return res.redirect('/login');
    }

    // ADMIN has full access across all operations
    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (allowedRoles.includes(req.user.role)) {
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
