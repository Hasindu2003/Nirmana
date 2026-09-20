const { User } = require('../models');
const authService = require('../services/authService');
const { logAudit } = require('../middleware/audit');

class UserController {
  async listUsers(req, res, next) {
    try {
      const users = await User.findAll({
        order: [['fullName', 'ASC']],
      });
      return res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req, res, next) {
    try {
      const { username, email, password, fullName, role, phone } = req.body;

      if (!username || !email || !password || !fullName || !role) {
        return res.status(400).json({
          success: false,
          message: 'Username, email, password, full name, and role are required.',
        });
      }

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Username is already taken.' });
      }

      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email address is already registered.' });
      }

      const user = await User.create({
        username,
        email,
        password,
        fullName,
        role,
        phone,
      });

      await logAudit({
        userId: req.user.id,
        action: 'USER_CREATED',
        entityName: 'User',
        entityId: user.id,
        details: { username: user.username, role: user.role },
        req,
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const { fullName, role, phone, isActive } = req.body;

      const user = await User.findByPk(id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      await user.update({ fullName, role, phone, isActive });

      await logAudit({
        userId: req.user.id,
        action: 'USER_UPDATED',
        entityName: 'User',
        entityId: user.id,
        details: { role, isActive },
        req,
      });

      return res.json({ success: true, message: 'User updated successfully.', data: user });
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      // Prevent deactivating oneself
      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
      }

      user.isActive = !user.isActive;
      await user.save();

      await logAudit({
        userId: req.user.id,
        action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityName: 'User',
        entityId: user.id,
        req,
      });

      return res.json({
        success: true,
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully.`,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      await authService.resetPassword(id, newPassword);

      await logAudit({
        userId: req.user.id,
        action: 'PASSWORD_RESET_BY_ADMIN',
        entityName: 'User',
        entityId: id,
        req,
      });

      return res.json({ success: true, message: 'User password reset successfully.' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
