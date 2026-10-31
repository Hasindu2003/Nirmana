const { Op } = require('sequelize');
const { StockItem, Product, ProductCategory } = require('../models');

/**
 * Product & Printing Service Catalog Service
 * Follows SOLID principles:
 * - Single Responsibility: Manages product/goods catalog and specifications viewing.
 * - Open/Closed: Extensible to support both physical stock inventory and printing service items.
 */
class ProductService {
  /**
   * Get all products, print materials, goods, and services for catalog display
   */
  async getAllCatalogProducts({ search = '', category = 'ALL', type = 'ALL' } = {}) {
    const stockWhere = { isActive: true };

    if (category && category !== 'ALL') {
      stockWhere.category = category;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      stockWhere[Op.or] = [
        { name: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { category: { [Op.like]: q } },
        { notes: { [Op.like]: q } },
      ];
    }

    // 1. Fetch physical goods, frames, substrates, and materials from StockItem
    const stockItems = await StockItem.findAll({
      where: stockWhere,
      order: [['category', 'ASC'], ['name', 'ASC']],
    });

    // Transform StockItems into unified Product Catalog view models
    const products = stockItems.map(item => {
      let isFrame = item.category === 'Photo Frames' || (item.width && item.length);
      let cat = (item.category || '').toLowerCase();
      let pType = isFrame ? 'PHOTO_FRAME' : 'PHYSICAL_GOOD';

      if (cat.includes('stationery') || cat.includes('pen') || cat.includes('pencil') || cat.includes('highlight')) {
        pType = 'STATIONERY';
      } else if (cat.includes('keytag') || cat.includes('merchandise') || cat.includes('mug') || cat.includes('gift')) {
        pType = 'MERCHANDISE';
      } else if (cat.includes('paper') || cat.includes('substrate')) {
        pType = 'SUBSTRATE';
      } else if (cat.includes('finishing') || cat.includes('binding')) {
        pType = 'FINISHING';
      }

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        type: pType,
        unit: item.unit,
        unitPrice: parseFloat(item.sellingPrice || item.unitCost || 0),
        unitCost: parseFloat(item.unitCost || 0),
        currentStock: parseFloat(item.currentStock || 0),
        inStock: parseFloat(item.currentStock || 0) > 0,
        description: item.notes || `Store merchandise & retail stock ready for instant counter purchase or custom branding.`,
        dimensions: (item.width && item.length) ? `${item.width} x ${item.length} ${item.dimensionUnit || 'in'}` : null,
        sizeLabel: item.sizeLabel || null,
        isCustomizable: true,
        source: 'STOCK',
        stockItemId: item.id,
      };
    });

    // 2. Also include standard print services catalog items
    const standardServices = [
      {
        id: 'SRV-01',
        code: 'SRV-BC',
        name: 'Executive Business Cards Printing',
        category: 'Printing Services',
        type: 'SERVICE',
        unit: 'Box (100 Pcs)',
        unitPrice: 1500.00,
        inStock: true,
        description: 'Single or double-sided full-color printing on 300gsm/350gsm art board with matte, velvet, or gloss lamination.',
        dimensions: '3.5 x 2.0 in',
        sizeLabel: 'Standard Card',
        isCustomizable: true,
        source: 'SERVICE',
      },
      {
        id: 'SRV-02',
        code: 'SRV-FLY',
        name: 'Full Color Promotional Flyers & Leaflets',
        category: 'Printing Services',
        type: 'SERVICE',
        unit: '100 Sheets',
        unitPrice: 2800.00,
        inStock: true,
        description: 'Vibrant offset/digital color print on 150gsm gloss art paper. Ideal for marketing handouts, events, and menus.',
        dimensions: 'A4 / A5',
        sizeLabel: 'A4 / A5',
        isCustomizable: true,
        source: 'SERVICE',
      },
      {
        id: 'SRV-03',
        code: 'SRV-BAN',
        name: 'Large Format Outdoor Vinyl Banner Print',
        category: 'Printing Services',
        type: 'SERVICE',
        unit: 'Sq. Ft',
        unitPrice: 120.00,
        inStock: true,
        description: 'High-density weatherproof eco-solvent print with eyelets and hemmed edges for signs, hoarding, and displays.',
        dimensions: 'Custom Size',
        sizeLabel: 'Per Sq. Ft',
        isCustomizable: true,
        source: 'SERVICE',
      },
      {
        id: 'SRV-04',
        code: 'SRV-MUG',
        name: 'Custom Sublimation Ceramic Photo Mug',
        category: 'Merchandise',
        type: 'MERCHANDISE',
        unit: 'Pcs',
        unitPrice: 850.00,
        inStock: true,
        description: '11oz Grade A white ceramic mug with high-gloss heat-press photo print and gift packaging box.',
        dimensions: '11 oz',
        sizeLabel: 'Standard 11oz',
        isCustomizable: true,
        source: 'SERVICE',
      },
      {
        id: 'SRV-05',
        code: 'SRV-DOC',
        name: 'Express Document Printing & Spiral Binding',
        category: 'Document Services',
        type: 'SERVICE',
        unit: 'Per Page',
        unitPrice: 25.00,
        inStock: true,
        description: 'Instant counter laser printing (Color or B&W) on 80gsm bond paper with clear plastic cover and plastic comb/wire binding.',
        dimensions: 'A4 / Legal',
        sizeLabel: 'A4',
        isCustomizable: true,
        source: 'SERVICE',
      },
    ];

    let combined = [...products];

    // Filter services if category filter matches
    if (category === 'ALL' || category === 'Printing Services' || category === 'Document Services' || category === 'Merchandise') {
      const filteredServices = standardServices.filter(s => {
        if (category !== 'ALL' && s.category !== category) return false;
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
        }
        return true;
      });
      combined = [...combined, ...filteredServices];
    }

    if (type && type !== 'ALL') {
      combined = combined.filter(p => p.type === type);
    }

    // Dynamically extract all available categories from stock goods + standard print services
    const categorySet = new Set([
      'Photo Frames',
      'Printing Services',
      'Stationery & Retail',
      'Merchandise & Keytags',
      'Paper / Substrate',
      'Document Services',
      'Vinyl / Film',
      'Finishing / Binding',
      ...combined.map(p => p.category).filter(Boolean)
    ]);
    const allCategories = Array.from(categorySet);

    return {
      products: combined,
      categories: allCategories,
    };
  }

  /**
   * Get full specifications and details for a single product
   */
  async getProductDetails(id) {
    // If it's a numeric ID, search StockItem
    if (!isNaN(parseInt(id, 10))) {
      const item = await StockItem.findByPk(id);
      if (item) {
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
          unitPrice: parseFloat(item.sellingPrice || 0),
          unitCost: parseFloat(item.unitCost || 0),
          currentStock: parseFloat(item.currentStock || 0),
          inStock: parseFloat(item.currentStock || 0) > 0,
          description: item.notes || `Authentic ${item.category} prepared for custom commercial printing and framing.`,
          dimensions: (item.width && item.length) ? `${item.width} x ${item.length} ${item.dimensionUnit || 'in'}` : null,
          sizeLabel: item.sizeLabel || null,
          width: item.width,
          length: item.length,
          dimensionUnit: item.dimensionUnit,
          source: 'STOCK',
        };
      }
    }

    // Check standard catalog
    const { products } = await this.getAllCatalogProducts();
    const found = products.find(p => String(p.id) === String(id) || p.code === String(id));
    if (found) return found;

    throw new Error('Product not found.');
  }
}

module.exports = new ProductService();
