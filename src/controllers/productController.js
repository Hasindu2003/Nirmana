const productService = require('../services/productService');
const { logAudit } = require('../middleware/audit');

class ProductController {
  async listCategories(req, res, next) {
    try {
      const categories = await productService.getAllCategories();
      return res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req, res, next) {
    try {
      const { name, type, description } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });

      const category = await productService.createCategory({ name, type, description });
      return res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }

  async listProducts(req, res, next) {
    try {
      const { categoryId, type, search, active } = req.query;
      const products = await productService.getAllProducts({
        categoryId,
        type,
        search,
        isActive: active === undefined ? undefined : active === 'true',
      });
      return res.json({ success: true, data: products });
    } catch (error) {
      next(error);
    }
  }

  async getProduct(req, res, next) {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);
      return res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }

  async createProduct(req, res, next) {
    try {
      const { name, categoryId, unitPrice, unit } = req.body;
      if (!name || !categoryId || unitPrice === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Product name, category, and unit price are required.',
        });
      }

      const product = await productService.createProduct(req.body);

      await logAudit({
        userId: req.user.id,
        action: 'PRODUCT_CREATED',
        entityName: 'Product',
        entityId: product.id,
        details: { name: product.name, code: product.code },
        req,
      });

      return res.status(201).json({
        success: true,
        message: 'Product / service created successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const product = await productService.updateProduct(id, req.body);

      await logAudit({
        userId: req.user.id,
        action: 'PRODUCT_UPDATED',
        entityName: 'Product',
        entityId: product.id,
        details: req.body,
        req,
      });

      return res.json({
        success: true,
        message: 'Product / service updated successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;
      const result = await productService.deleteProduct(id);

      await logAudit({
        userId: req.user.id,
        action: 'PRODUCT_DEACTIVATED',
        entityName: 'Product',
        entityId: id,
        req,
      });

      return res.json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
