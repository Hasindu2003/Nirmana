const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const config = require('../config/config');
const { User } = require('../models');

class AuthService {
  async login(identifier, password) {
    if (!identifier || !password) {
      throw new Error('Username/email and password are required.');
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: identifier.trim() },
          { email: identifier.trim().toLowerCase() },
        ],
      },
    });

    if (!user) {
      throw new Error('Invalid credentials.');
    }

    if (!user.isActive) {
      throw new Error('User account is deactivated. Please contact your administrator.');
    }

    const isValid = await user.verifyPassword(password);
    if (!isValid) {
      throw new Error('Invalid credentials.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      user: user.toJSON(),
      token,
    };
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found.');

    const isValid = await user.verifyPassword(currentPassword);
    if (!isValid) throw new Error('Current password is incorrect.');

    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    user.password = newPassword;
    await user.save();
    return true;
  }

  async resetPassword(userId, newPassword) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found.');

    user.password = newPassword || 'Password123!';
    await user.save();
    return true;
  }
}

module.exports = new AuthService();
