const customerService = require('../services/customerService');

class CustomerController {
  async listCustomers(req, res, next) {
    try {
      const { search, page, limit } = req.query;
      const result = await customerService.getAllCustomers({
        search,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        paginate: page || limit ? true : false,
      });
      if (result && result.pagination) {
        return res.json({ success: true, data: result.customers, pagination: result.pagination });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const customer = await customerService.getCustomerById(id);
      return res.json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  async createCustomer(req, res, next) {
    try {
      const { name, phone } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ success: false, message: 'Customer name and phone number are required.' });
      }
      if (!/^0\d{9}$/.test(phone.trim())) {
        return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).' });
      }

      const customer = await customerService.createCustomer(req.body);
      return res.status(201).json({
        success: true,
        message: 'Customer registered successfully.',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CustomerController();
