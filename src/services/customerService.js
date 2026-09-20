const { Op } = require('sequelize');
const { Customer, Order } = require('../models');

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
          attributes: ['id', 'orderNumber', 'jobTitle', 'totalAmount', 'status', 'createdAt'],
        },
      ],
      distinct: true,
    };

    if (!paginate) {
      return await Customer.findAll(queryOptions);
    }

    const totalCount = await Customer.count({ where, distinct: true });
    const pagination = buildPagination(totalCount, page, limit);

    queryOptions.limit = pagination.limit;
    queryOptions.offset = pagination.offset;

    const customers = await Customer.findAll(queryOptions);

    return {
      customers,
      pagination,
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
      ],
    });
    if (!customer) throw new Error('Customer not found.');
    return customer;
  }

  async createCustomer(data) {
    let customerCode = data.customerCode;
    if (!customerCode) {
      const count = await Customer.count();
      customerCode = `CUST-${(count + 1).toString().padStart(4, '0')}`;
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
