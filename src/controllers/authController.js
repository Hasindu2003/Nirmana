const authService = require('../services/authService');
const phoneVerificationService = require('../services/phoneVerificationService');
const { logAudit } = require('../middleware/audit');

class AuthController {
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);

      // Set stateless, serverless-proof HTTP-Only Cookie with signed JWT
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });

      // Also set web session
      if (req.session) {
        req.session.userId = result.user.id;
        req.session.userRole = result.user.role;
      }

      await logAudit({
        userId: result.user.id,
        action: 'USER_LOGIN',
        entityName: 'User',
        entityId: result.user.id,
        details: { username: result.user.username },
        req,
      });

      if (req.originalUrl.startsWith('/api/')) {
        return res.json({
          success: true,
          message: 'Login successful.',
          data: result,
        });
      }

      if (result.isCustomer || result.user.role === 'CUSTOMER') {
        return res.redirect('/portal');
      }

      return res.redirect('/dashboard');
    } catch (error) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: error.message });
      }
      return res.render('auth/login', {
        title: 'Sign In · Nirmana Printing',
        error: error.message,
        username: req.body.username || '',
      });
    }
  }

  async register(req, res, next) {
    try {
      const result = await authService.registerCustomer(req.body);

      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });

      if (req.session) {
        req.session.userId = result.user.id;
        req.session.userRole = result.user.role;
      }

      await logAudit({
        userId: result.user.id,
        action: 'CUSTOMER_REGISTER',
        entityName: 'User',
        entityId: result.user.id,
        details: { username: result.user.username },
        req,
      });

      if (req.originalUrl.startsWith('/api/')) {
        return res.status(201).json({
          success: true,
          message: 'Account created successfully.',
          data: result,
        });
      }

      return res.redirect('/portal');
    } catch (error) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return res.render('auth/register', {
        title: 'Create Account · Nirmana Printing',
        error: error.message,
        formData: req.body,
      });
    }
  }

  async logout(req, res, next) {
    try {
      if (req.user) {
        await logAudit({
          userId: req.user.id,
          action: 'USER_LOGOUT',
          entityName: 'User',
          entityId: req.user.id,
          req,
        });
      }

      res.clearCookie('auth_token');
      if (req.session) {
        req.session.destroy();
      }

      if (req.originalUrl.startsWith('/api/')) {
        return res.json({ success: true, message: 'Logged out successfully.' });
      }

      return res.redirect('/login');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res) {
    return res.json({
      success: true,
      data: req.user,
    });
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);

      await logAudit({
        userId: req.user.id,
        action: 'PASSWORD_CHANGED',
        entityName: 'User',
        entityId: req.user.id,
        req,
      });

      return res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
  async sendOtp(req, res, next) {
    try {
      const { phone } = req.body;
      const result = await phoneVerificationService.sendOtp(phone);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async verifyOtp(req, res, next) {
    try {
      const { phone, otp } = req.body;
      const result = await phoneVerificationService.verifyOtp(phone, otp);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new AuthController();
