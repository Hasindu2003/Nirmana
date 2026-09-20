const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User } = require('../models');

// Authenticate session for web views or JWT for API
const authenticate = async (req, res, next) => {
  try {
    // 1. Check web session
    if (req.session && req.session.userId) {
      const user = await User.findByPk(req.session.userId);
      if (user && user.isActive) {
        req.user = user;
        res.locals.currentUser = user;
        return next();
      }
    }

    // 2. Check Authorization Header (Bearer token for API)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findByPk(decoded.id);
        if (user && user.isActive) {
          req.user = user;
          res.locals.currentUser = user;
          return next();
        }
      } catch (tokenErr) {
        // Token invalid
      }
    }

    // If request expects JSON (API route)
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login or provide a valid Bearer token.',
      });
    }

    // Otherwise redirect browser to login
    return res.redirect('/login');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
};
