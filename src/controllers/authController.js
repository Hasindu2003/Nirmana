const authService = require('../services/authService');
const { logAudit } = require('../middleware/audit');

class AuthController {
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);

      // Save user ID to web session
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
}

module.exports = new AuthController();
