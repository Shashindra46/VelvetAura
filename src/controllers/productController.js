/**
 * VelvetAura - Product Catalog Controller
 * 
 * Provides RESTful query engine for luxury imported beauty products:
 * multi-facet filtering (category, origin, brand, price range), keyword search
 * with ReDoS-safe regex escaping, dynamic multi-column sorting, pagination,
 * category taxonomy discovery, and single-item detail lookup with ObjectId validation.
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');

/**
 * Escapes regex special characters to prevent ReDoS and regex syntax injection
 * @param {string} text - User input string
 * @returns {string} Safe regex string
 */
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * @desc    Get all products with filtering, search, sorting, and pagination
 * @route   GET /api/products
 * @access  Public
 */
const getProducts = async (req, res, next) => {
  try {
    const {
      category,
      origin,
      brand,
      featured,
      q,
      search,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    // 1. Category Filter (case-insensitive)
    if (category && typeof category === 'string' && category.trim()) {
      filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, 'i');
    }

    // 2. Origin Country Filter (case-insensitive)
    if (origin && typeof origin === 'string' && origin.trim()) {
      filter.origin = new RegExp(`^${escapeRegex(origin.trim())}$`, 'i');
    }

    // 3. Brand Filter (case-insensitive)
    if (brand && typeof brand === 'string' && brand.trim()) {
      filter.brand = new RegExp(`^${escapeRegex(brand.trim())}$`, 'i');
    }

    // 4. Featured Flag Filter
    if (featured !== undefined) {
      filter.featured = String(featured).toLowerCase() === 'true';
    }

    // 5. Price Range Filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined && !isNaN(Number(minPrice))) {
        filter.price.$gte = Number(minPrice);
      }
      if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
        filter.price.$lte = Number(maxPrice);
      }
      if (Object.keys(filter.price).length === 0) {
        delete filter.price;
      }
    }

    // 6. Keyword Search Filter across name, brand, description, origin, tags
    const keyword = (q || search || '').trim();
    if (keyword) {
      const safeKeyword = escapeRegex(keyword);
      const searchRegex = new RegExp(safeKeyword, 'i');
      filter.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { description: searchRegex },
        { origin: searchRegex },
        { tags: searchRegex },
      ];
    }

    // 7. Dynamic Sorting Strategy
    let sortOptions = { createdAt: -1, _id: 1 };
    if (sort) {
      switch (String(sort).toLowerCase()) {
        case 'price-asc':
        case 'price_asc':
        case 'price':
          sortOptions = { price: 1, _id: 1 };
          break;
        case 'price-desc':
        case 'price_desc':
        case '-price':
          sortOptions = { price: -1, _id: 1 };
          break;
        case 'rating':
        case 'rating-desc':
        case '-rating':
          sortOptions = { rating: -1, _id: 1 };
          break;
        case 'name':
        case 'name-asc':
          sortOptions = { name: 1, _id: 1 };
          break;
        case 'name-desc':
        case '-name':
          sortOptions = { name: -1, _id: 1 };
          break;
        case 'newest':
        case 'createdat':
        case '-createdat':
        default:
          sortOptions = { createdAt: -1, _id: 1 };
          break;
      }
    }

    // 8. Pagination Setup
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // 9. Query Execution
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const pages = Math.ceil(total / limitNum) || 1;

    return res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: pageNum,
      pages,
      products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get distinct product categories and import origins
 * @route   GET /api/products/categories
 * @access  Public
 */
const getCategories = async (req, res, next) => {
  try {
    let categories = await Product.distinct('category');
    let origins = await Product.distinct('origin');

    if (!categories || categories.length === 0) {
      categories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
    }
    if (!origins || origins.length === 0) {
      origins = ['France', 'South Korea', 'Japan', 'Germany', 'United Kingdom', 'USA', 'Sweden', 'Italy'];
    }

    return res.status(200).json({
      success: true,
      categories,
      origins,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single product by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Pre-validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product not found',
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private/Admin
 */
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      brand,
      origin,
      category,
      subcategory,
      description,
      price,
      originalPrice,
      currency,
      stock,
      rating,
      numReviews,
      reviewCount,
      image,
      images,
      featured,
      volume,
      tags,
      specs,
      specifications,
    } = req.body;

    // Field validations
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required and must be at least 2 characters',
        error: 'Invalid product name',
      });
    }

    if (!brand || typeof brand !== 'string' || !brand.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Brand name is required',
        error: 'Invalid product brand',
      });
    }

    if (!origin || typeof origin !== 'string' || !origin.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Import origin is required',
        error: 'Invalid product origin',
      });
    }

    const validCategories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
    const cleanCategory = typeof category === 'string' ? category.trim().toLowerCase() : '';
    if (!cleanCategory || !validCategories.includes(cleanCategory)) {
      return res.status(400).json({
        success: false,
        message: `Category is required and must be one of: ${validCategories.join(', ')}`,
        error: 'Invalid product category',
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Product description is required and must be at least 10 characters',
        error: 'Invalid product description',
      });
    }

    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Product price is required and cannot be negative',
        error: 'Invalid product price',
      });
    }

    if (stock === undefined || stock === null || isNaN(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Product stock is required and cannot be negative',
        error: 'Invalid product stock',
      });
    }

    let finalImages = [];
    if (Array.isArray(images) && images.length > 0) {
      finalImages = images.filter((img) => typeof img === 'string' && img.trim());
    } else if (image && typeof image === 'string' && image.trim()) {
      finalImages = [image.trim()];
    }

    const productData = {
      name: name.trim(),
      brand: brand.trim(),
      origin: origin.trim(),
      category: cleanCategory,
      subcategory: subcategory && typeof subcategory === 'string' ? subcategory.trim() : '',
      description: description.trim(),
      price: Number(price),
      originalPrice: originalPrice !== undefined && originalPrice !== null && !isNaN(Number(originalPrice)) ? Number(originalPrice) : null,
      currency: currency || 'LKR',
      stock: Math.floor(Number(stock)),
      rating: rating !== undefined && !isNaN(Number(rating)) ? Math.min(5, Math.max(0, Number(rating))) : 4.8,
      numReviews: (numReviews !== undefined ? numReviews : reviewCount) !== undefined ? Math.max(0, Number(numReviews || reviewCount || 0)) : 0,
      images: finalImages,
      featured: featured === true || String(featured).toLowerCase() === 'true',
      volume: volume && typeof volume === 'string' ? volume.trim() : '',
      tags: Array.isArray(tags) ? tags : [],
      specs: specs || specifications || {},
      specifications: specifications || specs || {},
    };

    const product = await Product.create(productData);

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Update an existing product
 * @route   PUT /api/products/:id
 * @access  Private/Admin
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product not found',
      });
    }

    const {
      name,
      brand,
      origin,
      category,
      subcategory,
      description,
      price,
      originalPrice,
      currency,
      stock,
      rating,
      numReviews,
      reviewCount,
      image,
      images,
      featured,
      volume,
      tags,
      specs,
      specifications,
    } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Product name must be at least 2 characters',
          error: 'Invalid product name',
        });
      }
      product.name = name.trim();
    }

    if (brand !== undefined) {
      if (typeof brand !== 'string' || !brand.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Brand name cannot be empty',
          error: 'Invalid product brand',
        });
      }
      product.brand = brand.trim();
    }

    if (origin !== undefined) {
      if (typeof origin !== 'string' || !origin.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Import origin cannot be empty',
          error: 'Invalid product origin',
        });
      }
      product.origin = origin.trim();
    }

    if (category !== undefined) {
      const validCategories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
      const cleanCategory = typeof category === 'string' ? category.trim().toLowerCase() : '';
      if (!validCategories.includes(cleanCategory)) {
        return res.status(400).json({
          success: false,
          message: `Category must be one of: ${validCategories.join(', ')}`,
          error: 'Invalid product category',
        });
      }
      product.category = cleanCategory;
    }

    if (subcategory !== undefined) {
      product.subcategory = typeof subcategory === 'string' ? subcategory.trim() : '';
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Product description must be at least 10 characters',
          error: 'Invalid product description',
        });
      }
      product.description = description.trim();
    }

    if (price !== undefined) {
      if (price === null || isNaN(Number(price)) || Number(price) < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price cannot be negative',
          error: 'Invalid product price',
        });
      }
      product.price = Number(price);
    }

    if (originalPrice !== undefined) {
      product.originalPrice = originalPrice !== null && !isNaN(Number(originalPrice)) ? Number(originalPrice) : null;
    }

    if (currency !== undefined) {
      product.currency = currency || 'LKR';
    }

    if (stock !== undefined) {
      if (stock === null || isNaN(Number(stock)) || Number(stock) < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock cannot be negative',
          error: 'Invalid product stock',
        });
      }
      product.stock = Math.floor(Number(stock));
    }

    if (rating !== undefined && !isNaN(Number(rating))) {
      product.rating = Math.min(5, Math.max(0, Number(rating)));
    }

    const reviewVal = numReviews !== undefined ? numReviews : reviewCount;
    if (reviewVal !== undefined && !isNaN(Number(reviewVal))) {
      product.numReviews = Math.max(0, Number(reviewVal));
    }

    if (Array.isArray(images)) {
      product.images = images.filter((img) => typeof img === 'string' && img.trim());
    } else if (image !== undefined && typeof image === 'string') {
      product.images = image.trim() ? [image.trim()] : [];
    }

    if (featured !== undefined) {
      product.featured = featured === true || String(featured).toLowerCase() === 'true';
    }

    if (volume !== undefined) {
      product.volume = typeof volume === 'string' ? volume.trim() : '';
    }

    if (Array.isArray(tags)) {
      product.tags = tags;
    }

    if (specs !== undefined || specifications !== undefined) {
      const newSpecs = specs || specifications || {};
      product.specs = newSpecs;
      product.specifications = newSpecs;
    }

    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Delete a product
 * @route   DELETE /api/products/:id
 * @access  Private/Admin
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product not found',
      });
    }

    await product.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload product image asset
 * @route   POST /api/products/upload
 * @access  Private/Admin
 */
const uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
        error: 'FILE_MISSING',
      });
    }

    const imageUrl = `/assets/images/products/${req.file.filename}`;

    return res.status(200).json({
      success: true,
      message: 'Product image uploaded successfully',
      imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getCategories,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
};
