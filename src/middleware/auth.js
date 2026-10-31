const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User } = require('../models');

// Authenticate session for web views or JWT for API
const authenticate = async (req, res, next) => {
  try {
    // 0. Fast-path: If user is already loaded and active, proceed in 0ms without hitting database
    if (req.user && req.user.isActive) {
      res.locals.currentUser = req.user;
      return next();
    }

    let token = null;

    // 1. Check HTTP-only auth cookie (stateless & Vercel serverless-proof)
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // 2. Check Authorization Header (Bearer token for API)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    // 3. If token found, verify JWT signature
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded && decoded.id) {
          const user = await User.findByPk(decoded.id);
          if (user && user.isActive) {
            req.user = user;
            res.locals.currentUser = user;
            if (req.session) {
              req.session.userId = user.id;
              req.session.userRole = user.role;
            }
            return next();
          }
        }
      } catch (tokenErr) {
        // Invalid or expired token
        res.clearCookie('auth_token');
      }
    }

    // 4. Fallback: Check memory session
    if (req.session && req.session.userId) {
      const user = await User.findByPk(req.session.userId);
      if (user && user.isActive) {
        req.user = user;
        res.locals.currentUser = user;
        return next();
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

// Optional authentication: populates req.user if present, but does not block guests
const optionalAuthenticate = async (req, res, next) => {
  try {
    if (req.user && req.user.isActive) {
      res.locals.currentUser = req.user;
      return next();
    }

    let token = null;
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded && decoded.id) {
          const user = await User.findByPk(decoded.id);
          if (user && user.isActive) {
            req.user = user;
            res.locals.currentUser = user;
          }
        }
      } catch (e) {}
    } else if (req.session && req.session.userId) {
      const user = await User.findByPk(req.session.userId);
      if (user && user.isActive) {
        req.user = user;
        res.locals.currentUser = user;
      }
    }
    return next();
  } catch (err) {
    return next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
};
