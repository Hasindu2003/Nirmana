const { Op } = require('sequelize');
const { Product, ProductCategory } = require('../models');

class ProductService {
  async getAllCategories() {
    return await ProductCategory.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
      include: [{ model: Product, as: 'products', attributes: ['id', 'name', 'code'] }],
    });
  }

  async createCategory(data) {
    return await ProductCategory.create(data);
  }

  async getAllProducts({ categoryId, type, search, isActive }) {
    const where = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (type) {
      where.type = type;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { description: { [Op.like]: q } },
      ];
    }

    return await Product.findAll({
      where,
      order: [['name', 'ASC']],
      include: [{ model: ProductCategory, as: 'category' }],
    });
  }

  async getProductById(id) {
    const product = await Product.findByPk(id, {
      include: [{ model: ProductCategory, as: 'category' }],
    });
    if (!product) throw new Error('Product or print service not found.');
    return product;
  }

  async createProduct(data) {
    // Generate code if not provided
    if (!data.code) {
      const prefix = data.type === 'PHYSICAL' ? 'RAW' : 'PRD';
      const count = await Product.count();
      data.code = `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
    }

    if (data.defaultSpecs && typeof data.defaultSpecs === 'object') {
      data.defaultSpecs = JSON.stringify(data.defaultSpecs);
    }

    if (data.requiredMaterials && typeof data.requiredMaterials === 'object') {
      data.requiredMaterials = JSON.stringify(data.requiredMaterials);
    }

    return await Product.create(data);
  }

  async updateProduct(id, data) {
    const product = await Product.findByPk(id);
    if (!product) throw new Error('Product not found.');

    const fieldsToUpdate = { ...data };
    if (data.defaultSpecs && typeof data.defaultSpecs === 'object') {
      fieldsToUpdate.defaultSpecs = JSON.stringify(data.defaultSpecs);
    }

    await product.update(fieldsToUpdate);
    return product;
  }

  async deleteProduct(id) {
    const product = await Product.findByPk(id);
    if (!product) throw new Error('Product not found.');
    product.isActive = false;
    await product.save();
    return { success: true, message: 'Product deactivated.' };
  }
}

module.exports = new ProductService();
