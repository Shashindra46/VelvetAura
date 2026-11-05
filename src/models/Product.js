/**
 * VelvetAura - Product Catalog Data Model
 * Manages luxury imported beauty products with category constraints,
 * multi-field full-text search indexing, stock levels, and ratings.
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [150, 'Product name cannot exceed 150 characters'],
      index: true,
    },
    brand: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      index: true,
    },
    origin: {
      type: String,
      required: [true, 'Import origin is required'],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      enum: {
        values: ['skincare', 'cosmetics', 'fragrances', 'haircare'],
        message: '{VALUE} is not a supported category',
      },
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative'],
      default: null,
    },
    currency: {
      type: String,
      default: 'LKR',
      trim: true,
      uppercase: true,
    },
    stock: {
      type: Number,
      required: [true, 'Stock inventory count is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    rating: {
      type: Number,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot exceed 5'],
      default: 4.8,
    },
    numReviews: {
      type: Number,
      min: [0, 'Review count cannot be negative'],
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    volume: {
      type: String,
      trim: true,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    specifications: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for single hero image accessor
productSchema.virtual('image').get(function () {
  return this.images && this.images.length > 0 ? this.images[0] : '';
});

// Set virtual image setter to populate images array or update primary hero image
productSchema.virtual('image').set(function (val) {
  if (val) {
    if (!this.images || !Array.isArray(this.images) || this.images.length === 0) {
      this.images = [val];
    } else {
      this.images[0] = val;
      if (typeof this.markModified === 'function') {
        this.markModified('images');
      }
    }
  }
});

productSchema.pre('validate', function (next) {
  // If specs is provided, mirror to specifications (and vice-versa)
  if (this.specs && Object.keys(this.specs).length > 0 && (!this.specifications || Object.keys(this.specifications).length === 0)) {
    this.specifications = this.specs;
  } else if (this.specifications && Object.keys(this.specifications).length > 0 && (!this.specs || Object.keys(this.specs).length === 0)) {
    this.specs = this.specifications;
  }
  next();
});

// Compound full-text search index
productSchema.index(
  {
    name: 'text',
    brand: 'text',
    origin: 'text',
    description: 'text',
    tags: 'text',
  },
  {
    weights: {
      name: 10,
      brand: 8,
      origin: 5,
      tags: 5,
      description: 2,
    },
    name: 'ProductTextIndex',
  }
);

// Facet compound indexes for fast sorting and filtering
productSchema.index({ category: 1, price: 1 });
productSchema.index({ origin: 1, category: 1 });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
