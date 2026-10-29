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
      { id: user.id, username: user.username, role: user.role, customerId: user.customerId || null },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      user: user.toJSON(),
      token,
      isCustomer: user.role === 'CUSTOMER',
    };
  }

  async registerCustomer(data) {
    const { sequelize, User, Customer } = require('../models');
    const fullName = (data.fullName || data.name || '').trim();
    const phone = (data.phone || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const companyName = data.companyName ? data.companyName.trim() : null;
    const username = (data.username || '').trim().toLowerCase();
    const password = data.password;

    if (!fullName) throw new Error('Full name is required.');
    if (!phone) throw new Error('Phone number is required.');
    if (!/^0\d{9}$/.test(phone)) {
      throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
    }
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters long.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    return await sequelize.transaction(async (t) => {
      // Check if username or email already taken
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { username },
            ...(email ? [{ email }] : []),
          ],
        },
        transaction: t,
      });

      if (existingUser) {
        if (existingUser.username === username) {
          throw new Error('This username is already taken. Please choose another username.');
        }
        if (email && existingUser.email === email) {
          throw new Error('An account with this email already exists. Please log in.');
        }
      }

      // Check if customer with this phone number already exists
      let customer = await Customer.findOne({
        where: { phone },
        transaction: t,
      });

      if (!customer) {
        const custCount = await Customer.count({ transaction: t });
        let custSeq = custCount + 1;
        let customerCode = `CUST-${custSeq.toString().padStart(4, '0')}`;
        while (await Customer.findOne({ where: { customerCode }, transaction: t })) {
          custSeq++;
          customerCode = `CUST-${custSeq.toString().padStart(4, '0')}`;
        }
        customer = await Customer.create({
          customerCode,
          name: fullName,
          phone,
          email: email || null,
          companyName: companyName || null,
          notes: 'Self-registered client portal account',
          isActive: true,
        }, { transaction: t });
      } else {
        if (!customer.email && email) customer.email = email;
        if (!customer.companyName && companyName) customer.companyName = companyName;
        await customer.save({ transaction: t });
      }

      const userEmail = email || `${username}@client.nirmana.lk`;
      const newUser = await User.create({
        username,
        email: userEmail,
        password,
        fullName,
        phone,
        role: 'CUSTOMER',
        customerId: customer.id,
        isActive: true,
        lastLoginAt: new Date(),
      }, { transaction: t });

      customer.userId = newUser.id;
      await customer.save({ transaction: t });

      const token = jwt.sign(
        { id: newUser.id, username: newUser.username, role: newUser.role, customerId: customer.id },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      return {
        user: newUser.toJSON(),
        customer,
        token,
        isCustomer: true,
      };
    });
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
