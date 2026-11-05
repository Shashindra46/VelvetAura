/**
 * VelvetAura - Shopping Cart Data Model
 * Tracks customer shopping carts with snapshot line items and an automated
 * mathematical recalculation engine for subtotal, 8% tax, and tiered shipping.
 */

const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Item price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      default: 1,
    },
    image: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cart must belong to a user'],
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0.0,
      min: 0,
    },
    tax: {
      type: Number,
      required: true,
      default: 0.0,
      min: 0,
    },
    shipping: {
      type: Number,
      required: true,
      default: 0.0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      default: 0.0,
      min: 0,
    },
    itemCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Recalculate mathematical totals for the shopping cart:
 * - Subtotal = sum(price * qty)
 * - Tax = 8% of subtotal (half-up rounded to 2 decimals)
 * - Shipping = Free ($0.00) if subtotal >= $50.00; otherwise $5.99 (or $0 if empty)
 * - GrandTotal = subtotal + tax + shipping
 * - ItemCount = sum(quantity)
 */
cartSchema.methods.recalculateTotals = function () {
  const items = this.items || [];

  // Calculate raw subtotal
  const rawSubtotal = items.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const prc = Number(item.price) || 0;
    return acc + qty * prc;
  }, 0);
  this.subtotal = Math.round(rawSubtotal * 100) / 100;

  // Calculate 8% tax
  this.tax = Math.round(this.subtotal * 0.08 * 100) / 100;

  // Calculate shipping: Free >= $50, else $5.99; if empty ($0), shipping is $0
  if (this.subtotal === 0) {
    this.shipping = 0.0;
  } else if (this.subtotal >= 50.0) {
    this.shipping = 0.0;
  } else {
    this.shipping = 5.99;
  }

  // Calculate grand total
  this.grandTotal = Math.round((this.subtotal + this.tax + this.shipping) * 100) / 100;

  // Calculate item count
  this.itemCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  return this;
};

// Automatic pre-save hook ensuring totals are always freshly calculated
cartSchema.pre('save', function (next) {
  this.recalculateTotals();
  next();
});

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
