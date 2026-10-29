const { Op } = require('sequelize');
const { Customer, Order, User } = require('../models');

const { buildPagination } = require('../utils/pagination');

class CustomerService {
  async getAllCustomers({ search, page = 1, limit = 10, paginate = false } = {}) {
    const where = { isActive: true };

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { companyName: { [Op.like]: q } },
        { customerCode: { [Op.like]: q } },
      ];
    }

    const queryOptions = {
      where,
      order: [['name', 'ASC']],
      include: [
        {
          model: Order,
          as: 'orders',
          attributes: ['id', 'totalAmount', 'advancePaid', 'balanceAmount'],
        },
        {
          model: User,
          as: 'userAccount',
          attributes: ['id', 'username', 'email', 'role', 'lastLoginAt', 'isActive'],
        },
      ],
      distinct: true,
    };

    const enrichCustomer = (c) => {
      const orders = c.orders || [];
      let totalBilled = 0;
      let givenAmount = 0;
      let yetToGive = 0;

      orders.forEach(o => {
        totalBilled += parseFloat(o.totalAmount) || 0;
        givenAmount += parseFloat(o.advancePaid) || 0;
        yetToGive += parseFloat(o.balanceAmount) || 0;
      });

      c.dataValues.ordersCount = orders.length;
      c.dataValues.totalBilled = parseFloat(totalBilled.toFixed(2));
      c.dataValues.givenAmount = parseFloat(givenAmount.toFixed(2));
      c.dataValues.yetToGive = parseFloat(yetToGive.toFixed(2));
      c.dataValues.hasLoginAccount = Boolean(c.userAccount || c.userId);
      return c;
    };

    if (!paginate) {
      const rows = await Customer.findAll(queryOptions);
      return rows.map(enrichCustomer);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    queryOptions.limit = limitNum;
    queryOptions.offset = offset;

    const { count, rows: rawCustomers } = await Customer.findAndCountAll(queryOptions);
    const customers = rawCustomers.map(enrichCustomer);
    const pagination = buildPagination(count, pageNum, limitNum);

    // Calculate global customer accounts summary
    const allActive = await Customer.findAll({
      where: { isActive: true },
      include: [
        { model: Order, as: 'orders', attributes: ['totalAmount', 'advancePaid', 'balanceAmount'] },
        { model: User, as: 'userAccount', attributes: ['id'] },
      ],
    });

    let sumBilled = 0;
    let sumGiven = 0;
    let sumYetToGive = 0;
    let registeredUsersCount = 0;

    allActive.forEach(c => {
      if (c.userAccount || c.userId) registeredUsersCount++;
      (c.orders || []).forEach(o => {
        sumBilled += parseFloat(o.totalAmount) || 0;
        sumGiven += parseFloat(o.advancePaid) || 0;
        sumYetToGive += parseFloat(o.balanceAmount) || 0;
      });
    });

    const accountsSummary = {
      totalAccounts: count,
      registeredUsersCount,
      totalBilled: parseFloat(sumBilled.toFixed(2)),
      totalGiven: parseFloat(sumGiven.toFixed(2)),
      totalYetToGive: parseFloat(sumYetToGive.toFixed(2)),
    };

    return {
      customers,
      pagination,
      accountsSummary,
    };
  }

  async getCustomerById(id) {
    const customer = await Customer.findByPk(id, {
      include: [
        {
          model: Order,
          as: 'orders',
          order: [['createdAt', 'DESC']],
        },
        {
          model: User,
          as: 'userAccount',
          attributes: ['id', 'username', 'email', 'role', 'lastLoginAt', 'isActive'],
        },
      ],
    });
    if (!customer) throw new Error('Customer not found.');

    const orders = customer.orders || [];
    let totalBilled = 0;
    let totalDiscount = 0;
    let totalGiven = 0;
    let totalYetToGive = 0;

    orders.forEach(o => {
      totalBilled += parseFloat(o.totalAmount) || 0;
      totalDiscount += parseFloat(o.discount) || 0;
      totalGiven += parseFloat(o.advancePaid) || 0;
      totalYetToGive += parseFloat(o.balanceAmount) || 0;
    });

    customer.dataValues.ordersCount = orders.length;
    customer.dataValues.totalBilled = parseFloat(totalBilled.toFixed(2));
    customer.dataValues.totalDiscount = parseFloat(totalDiscount.toFixed(2));
    customer.dataValues.totalGiven = parseFloat(totalGiven.toFixed(2));
    customer.dataValues.totalYetToGive = parseFloat(totalYetToGive.toFixed(2));
    customer.dataValues.hasLoginAccount = Boolean(customer.userAccount || customer.userId);

    return customer;
  }

  async createCustomer(data) {
    let customerCode = data.customerCode;
    if (!customerCode) {
      const count = await Customer.count();
      let seq = count + 1;
      customerCode = `CUST-${seq.toString().padStart(4, '0')}`;
      while (await Customer.findOne({ where: { customerCode } })) {
        seq++;
        customerCode = `CUST-${seq.toString().padStart(4, '0')}`;
      }
    }

    const phone = (data.phone || '').trim();
    if (!phone) {
      throw new Error('Customer phone number is required.');
    }
    if (!/^0\d{9}$/.test(phone)) {
      throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
    }

    return await Customer.create({
      customerCode,
      name: data.name.trim(),
      phone,
      email: data.email || null,
      companyName: data.companyName || null,
      address: data.address || null,
      notes: data.notes || null,
      isActive: true,
    });
  }

  async updateCustomer(id, data) {
    const customer = await Customer.findByPk(id);
    if (!customer) throw new Error('Customer not found.');

    if (data.phone !== undefined) {
      const phone = (data.phone || '').trim();
      if (!/^0\d{9}$/.test(phone)) {
        throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
      }
      data.phone = phone;
    }

    await customer.update(data);
    return customer;
  }
}

module.exports = new CustomerService();
