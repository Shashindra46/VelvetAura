/**
 * VelvetAura - Order Data Model
 * Immutable record of completed customer purchases containing line-item snapshots,
 * shipping destinations, mock payment receipts, and financial breakdowns.
 */

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
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
    origin: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const orderAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: '' },
    street: { type: String, trim: true, default: '' },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    zip: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'USA' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: ['cod', 'bank_transfer', 'payhere', 'mock_credit_card'],
      default: 'cod',
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'succeeded', 'captured', 'authorized'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    cardLast4: {
      type: String,
      default: '',
    },
    gatewayTransactionId: {
      type: String,
      default: null,
    },
    gatewayHash: {
      type: String,
      default: null,
    },
    payherePaymentId: {
      type: String,
      default: null,
    },
    payhereHash: {
      type: String,
      default: null,
    },
    bankDetails: {
      bankName: { type: String, default: '' },
      branch: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      confirmed: { type: Boolean, default: false },
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [
        (val) => val && val.length > 0,
        'An order must contain at least one item',
      ],
    },
    shippingAddress: {
      type: orderAddressSchema,
      required: true,
    },
    currency: {
      type: String,
      default: 'LKR',
      uppercase: true,
      trim: true,
    },
    pricing: {
      type: pricingSchema,
      required: true,
    },
    // Top-level aliases for contract compatibility
    subtotal: { type: Number, min: 0 },
    tax: { type: Number, min: 0 },
    shipping: { type: Number, min: 0 },
    grandTotal: { type: Number, min: 0 },

    // First-class payment fields
    paymentMethod: {
      type: String,
      enum: ['cod', 'bank_transfer', 'payhere', 'mock_credit_card'],
      default: 'cod',
      required: [true, 'Payment method is required'],
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      default: null,
      trim: true,
    },
    gatewayHash: {
      type: String,
      default: null,
      trim: true,
    },
    paymentNotes: {
      type: String,
      default: '',
      trim: true,
    },
    paymentMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    payment: {
      type: paymentSchema,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'completed',
        'shipped',
        'delivered',
        'cancelled',
      ],
      default: 'completed',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual aliases
orderSchema.virtual('orderItems').get(function () {
  return this.items;
});

orderSchema.virtual('paymentDetails').get(function () {
  return this.payment;
});

// Pre-save synchronization for pricing aliases, order number, and payment fields
orderSchema.pre('validate', function (next) {
  // Sync currency
  if (!this.currency) {
    this.currency = 'LKR';
  }

  if (!this.orderNumber) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `VA-${dateStr}-${randomSuffix}`;
  }

  // Ensure top-level pricing syncs with nested pricing object
  if (this.pricing) {
    this.subtotal = this.pricing.subtotal;
    this.tax = this.pricing.tax;
    this.shipping = this.pricing.shipping;
    this.grandTotal = this.pricing.grandTotal;
  } else if (this.subtotal !== undefined && this.tax !== undefined && this.shipping !== undefined && this.grandTotal !== undefined) {
    this.pricing = {
      subtotal: this.subtotal,
      tax: this.tax,
      shipping: this.shipping,
      grandTotal: this.grandTotal,
    };
  }

  // Synchronize street/addressLine1 in shippingAddress
  if (this.shippingAddress) {
    if (this.shippingAddress.street && !this.shippingAddress.addressLine1) {
      this.shippingAddress.addressLine1 = this.shippingAddress.street;
    } else if (this.shippingAddress.addressLine1 && !this.shippingAddress.street) {
      this.shippingAddress.street = this.shippingAddress.addressLine1;
    }
  }

  // Synchronize payment fields
  if (!this.paymentMethod && this.payment?.method) {
    this.paymentMethod = this.payment.method;
  }
  if (!this.paymentMethod) {
    this.paymentMethod = 'cod';
  }

  if (!this.paymentStatus && this.payment?.status) {
    if (['succeeded', 'paid', 'captured'].includes(this.payment.status)) {
      this.paymentStatus = 'paid';
    } else if (this.payment.status === 'failed') {
      this.paymentStatus = 'failed';
    } else {
      this.paymentStatus = 'pending';
    }
  }
  if (!this.paymentStatus) {
    this.paymentStatus = 'pending';
  }

  if (!this.payment) {
    const prefix =
      this.paymentMethod === 'bank_transfer'
        ? 'BT-VA'
        : this.paymentMethod === 'payhere'
        ? 'PH-VA'
        : this.paymentMethod === 'mock_credit_card'
        ? 'TXN-VA'
        : 'COD-VA';
    const txn =
      this.gatewayTransactionId ||
      `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    this.payment = {
      transactionId: txn,
      method: this.paymentMethod,
      status: this.paymentStatus,
      paidAt: this.paymentStatus === 'paid' ? new Date() : null,
      cardLast4: '',
      gatewayTransactionId: this.gatewayTransactionId || null,
      gatewayHash: this.gatewayHash || null,
      notes: this.paymentNotes || '',
    };
  } else {
    // Bi-directional sync
    if (this.paymentMethod) {
      this.payment.method = this.paymentMethod;
    }
    if (this.paymentStatus) {
      this.payment.status = this.paymentStatus;
      if (this.paymentStatus === 'paid') {
        if (!this.payment.paidAt) this.payment.paidAt = new Date();
      } else if (this.paymentStatus === 'pending') {
        this.payment.paidAt = null;
      }
    }
    if (this.gatewayTransactionId) {
      this.payment.gatewayTransactionId = this.gatewayTransactionId;
      if (!this.payment.transactionId) {
        this.payment.transactionId = this.gatewayTransactionId;
      }
    } else if (this.payment.gatewayTransactionId) {
      this.gatewayTransactionId = this.payment.gatewayTransactionId;
    } else if (this.payment.transactionId) {
      this.gatewayTransactionId = this.payment.transactionId;
    }

    if (this.gatewayHash) {
      this.payment.gatewayHash = this.gatewayHash;
    } else if (this.payment.gatewayHash) {
      this.gatewayHash = this.payment.gatewayHash;
    }

    if (this.paymentNotes) {
      this.payment.notes = this.paymentNotes;
    } else if (this.payment.notes) {
      this.paymentNotes = this.payment.notes;
    }
  }

  next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
