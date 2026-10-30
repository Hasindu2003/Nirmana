const productService = require('../services/productService');
const { logAudit } = require('../middleware/audit');

class ProductController {
  async listProducts(req, res, next) {
    try {
      const { category, type, search } = req.query;
      const result = await productService.getAllCatalogProducts({
        category,
        type,
        search,
      });
      return res.json({ success: true, data: result.products, categories: result.categories });
    } catch (error) {
      next(error);
    }
  }

  async getProduct(req, res, next) {
    try {
      const { id } = req.params;
      const product = await productService.getProductDetails(id);
      return res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
