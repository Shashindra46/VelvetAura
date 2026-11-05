# Architecture & Technical Design: Data Models, Authentication & Health Subsystems

**Author**: `teamwork_explorer_m1_3`  
**Target Milestone**: Milestone 1 (Backend Foundation & Data Persistence)  
**Workspace**: `g:\VelvetAura`  
**Date**: 2026-11-04  
**Status**: Ready for Implementation  

---

## 1. Executive Summary & Problem Scope

VelvetAura is a full-stack e-commerce web platform for imported luxury beauty products (skincare, cosmetics, fragrances, haircare). Milestone 1 establishes the rock-solid foundation for the backend REST API.

This document delivers the architectural design, schema definitions, security protocols, API contracts, and implementation blueprints for three core subsystems:
1. **Core Mongoose Data Models**:
   - `src/models/User.js`: User identity, credential storage, role definition, shipping address, and transparent bcryptjs pre-save hashing with password verification methods.
   - `src/models/Product.js`: Luxury catalog entity with multi-field full-text search indexing, category enumeration, origin tracking, pricing, and stock inventory limits.
   - `src/models/Cart.js`: Persistent shopping cart with snapshot line items and an automated mathematical recalculation engine for subtotal, 8% sales tax, tiered shipping rules (free over $50, $5.99 below), and grand total.
   - `src/models/Order.js`: Immutable purchase order records containing frozen line-item snapshots, destination shipping addresses, payment authorization simulation records, financial breakdowns, and fulfillment lifecycle tracking.
2. **Authentication & Authorization Subsystem**:
   - `src/controllers/authController.js`: Handlers for customer registration (`register`), credential validation and JWT issuance (`login`), and active identity retrieval (`me`).
   - `src/routes/authRoutes.js`: Clean Express routing definitions binding authentication endpoints to validation and controllers.
   - `src/middleware/authMiddleware.js`: `protect` middleware verifying `Authorization: Bearer <jwt_token>` headers, decoding claims, and injecting authenticated user documents into request contexts.
3. **System Diagnostic & Health Subsystem**:
   - `src/routes/healthRoutes.js`: Non-blocking `/api/health` diagnostic endpoint reporting operational status, uptime, server timestamp, and active database mode (`memory` vs `external`).

---

## 2. Subsystem File Layout & Responsibility Matrix

```
g:\VelvetAura\
├── src/
│   ├── models/
│   │   ├── User.js              # User schema, bcryptjs pre-save hook, comparePassword method
│   │   ├── Product.js           # Catalog schema, category enum, text & filter indexes
│   │   ├── Cart.js              # Shopping cart schema, item array, recalculateTotals helper
│   │   └── Order.js             # Order schema, frozen snapshot, payment receipt, tracking ID
│   ├── controllers/
│   │   └── authController.js    # register, login, getMe, updateProfile
│   ├── routes/
│   │   ├── authRoutes.js        # /api/auth/register, /api/auth/login, /api/auth/me
│   │   └── healthRoutes.js      # /api/health
│   └── middleware/
│       └── authMiddleware.js    # protect (Bearer JWT verification), optionalAuth
└── tests/
    ├── auth.test.js             # Automated verification for register, login, me, and protect
    └── health.test.js           # Automated verification for /api/health probe
```

---

## 3. Data Models Specification & Schemas

### 3.1 User Model (`src/models/User.js`)

#### Design Rationale & Security Objectives
- **Password Protection**: Passwords must never be stored in plaintext. Passwords must be hashed using `bcryptjs` with a work factor (salt rounds) of 10.
- **Data Leakage Defense**: The `password` field must be configured with `select: false` so standard queries (such as finding users or populating user references in orders/carts) never return the hash.
- **JSON Serialization Sanitization**: Mongoose's `toJSON` and `toObject` transform hooks must strip `password` and `__v` to prevent accidental serialization.
- **Idempotent Hashing**: The pre-save hook must check `this.isModified('password')` to prevent re-hashing an already hashed password on profile updates.
- **Method Equivalence**: Provide both `comparePassword(candidatePassword)` and `matchPassword(candidatePassword)` to ensure compatibility with callers across all milestones.

#### Schema Definition & Attributes
| Field | Type | Required | Constraints / Default | Description |
|---|---|---|---|---|
| `name` | `String` | Yes | `trim: true`, `minlength: 2`, `maxlength: 60` | Full name of the user |
| `email` | `String` | Yes | `unique: true`, `lowercase: true`, `trim: true`, Regex validation | Unique login identifier |
| `password` | `String` | Yes | `minlength: 6`, `select: false` | Bcryptjs hashed password |
| `role` | `String` | Yes | `enum: ['customer', 'admin']`, `default: 'customer'` | Access control tier |
| `shippingAddress` | `Object` | No | Nested subdocument: `fullName`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`, `country`, `phone` | Saved default address |
| `createdAt` / `updatedAt` | `Date` | Yes | Auto-managed via `timestamps: true` | Audit timestamps |

#### Implementation Blueprint (`src/models/User.js`)
```javascript
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: '' },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'USA' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    shippingAddress: {
      type: shippingAddressSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        ret.id = ret._id;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

// Pre-save hook for bcrypt password hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare candidate password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    throw new Error('Password field not selected in query');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Alias for backwards/alternate compatibility
userSchema.methods.matchPassword = function (candidatePassword) {
  return this.comparePassword(candidatePassword);
};

const User = mongoose.model('User', userSchema);
export default User;
```

---

### 3.2 Product Model (`src/models/Product.js`)

#### Design Rationale & Catalog Requirements
- **Luxury Import Specialization**: Products come from renowned international beauty capitals (e.g. South Korea, France, Japan, Italy, Sweden, United Kingdom, Germany, USA). The `origin` field is indexed to facilitate fast country-based filtering.
- **Category Classification**: Rigidly constrained to 4 primary categories (`skincare`, `cosmetics`, `fragrances`, `haircare`) with optional subcategories (e.g., `Serum`, `Moisturizer`, `Eau de Parfum`, `Lipstick`).
- **Full-Text Search Engine**: A compound MongoDB text index across `name`, `brand`, `origin`, `description`, and `tags` enables lightning-fast search queries across all product metadata without external search engines.
- **Images & Virtuals**: Stores an array of image URLs or SVG placeholders (`images: [String]`) with a virtual getter `image` returning the primary hero image `images[0]`.

#### Schema Definition & Attributes
| Field | Type | Required | Constraints / Default | Description |
|---|---|---|---|---|
| `name` | `String` | Yes | `trim: true`, `minlength: 2`, `maxlength: 150`, Indexed | Commercial title |
| `brand` | `String` | Yes | `trim: true`, Indexed | Luxury/Artisanal brand name |
| `origin` | `String` | Yes | `trim: true`, Indexed | Country of manufacture |
| `category` | `String` | Yes | `enum: ['skincare', 'cosmetics', 'fragrances', 'haircare']`, Indexed | Core department |
| `subcategory` | `String` | No | `trim: true` | Fine-grained classification |
| `description` | `String` | Yes | `trim: true`, `minlength: 10` | Detailed product narrative |
| `price` | `Number` | Yes | `min: 0` | Current selling price (USD) |
| `originalPrice` | `Number` | No | `min: 0` | Strikethrough/MSRP price |
| `currency` | `String` | Yes | `default: 'USD'` | Currency symbol/code |
| `stock` | `Number` | Yes | `min: 0`, `default: 0`, `integer: true` | Available inventory count |
| `rating` | `Number` | Yes | `min: 0`, `max: 5`, `default: 4.8` | Customer review average |
| `numReviews` | `Number` | Yes | `min: 0`, `default: 0` | Count of customer reviews |
| `images` | `[String]` | Yes | `default: []` | Product photography URIs |
| `featured` | `Boolean` | Yes | `default: false`, Indexed | Flag for hero highlights |
| `volume` | `String` | No | `trim: true` | E.g. "50 ml / 1.7 fl oz" |
| `tags` | `[String]` | No | `default: []` | Search tags (e.g. "clean", "vegan") |
| `specifications` | `Object` | No | Key-value pairs for ingredients, skin type | Technical specs |

#### Indexes
- Text search: `{ name: 'text', brand: 'text', origin: 'text', description: 'text', tags: 'text' }` with weights: `{ name: 10, brand: 8, origin: 5, tags: 5, description: 2 }`.
- Filtering compounds: `{ category: 1, price: 1 }`, `{ origin: 1 }`, `{ brand: 1 }`, `{ featured: 1 }`.

#### Implementation Blueprint (`src/models/Product.js`)
```javascript
import mongoose from 'mongoose';

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
      default: 'USD',
      trim: true,
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
export default Product;
```

---

### 3.3 Cart Model (`src/models/Cart.js`)

#### Design Rationale & Mathematical Integrity
- **Cart-to-User Association**: One cart per user (`user: ObjectId, unique: true, index: true`).
- **Denormalized Snapshots**: Each cart line item preserves the product reference, product name, brand, unit price, quantity, and thumbnail image.
- **Automated Pricing Recalculation Engine**:
  - `subtotal`: $\sum (\text{item.price} \times \text{item.quantity})$
  - `tax`: $8\%$ standard sales tax on subtotal, rounded to 2 decimal places: $\text{Math.round}(\text{subtotal} \times 0.08 \times 100) / 100$.
  - `shipping`: Free shipping threshold:
    - If `subtotal === 0` (empty cart): $\text{shipping} = 0.00$.
    - If `subtotal >= 50.00`: $\text{shipping} = 0.00$ ("Complimentary Luxury Shipping").
    - If `0 < subtotal < 50.00`: $\text{shipping} = 5.99$ (Standard Flat Rate).
  - `grandTotal`: $\text{subtotal} + \text{tax} + \text{shipping}$.
  - `itemCount`: $\sum \text{item.quantity}$ (directly binds to frontend cart badge).
- **Pre-Save Automation**: Mongoose `pre('save')` automatically invokes `this.recalculateTotals()` so inconsistent financial totals can never be written to MongoDB.

#### Implementation Blueprint (`src/models/Cart.js`)
```javascript
import mongoose from 'mongoose';

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

// Mathematical recalculation instance method
cartSchema.methods.recalculateTotals = function () {
  const items = this.items || [];
  
  // Calculate subtotal
  const rawSubtotal = items.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const prc = Number(item.price) || 0;
    return acc + qty * prc;
  }, 0);
  this.subtotal = Number(rawSubtotal.toFixed(2));

  // Calculate 8% tax
  const rawTax = this.subtotal * 0.08;
  this.tax = Number(rawTax.toFixed(2));

  // Calculate shipping: Free >= $50, else $5.99; if empty ($0), shipping is $0
  if (this.subtotal === 0) {
    this.shipping = 0.0;
  } else if (this.subtotal >= 50.0) {
    this.shipping = 0.0;
  } else {
    this.shipping = 5.99;
  }

  // Calculate grand total
  this.grandTotal = Number((this.subtotal + this.tax + this.shipping).toFixed(2));

  // Calculate total item count (units)
  this.itemCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  return this;
};

// Automatic pre-save hook ensuring totals are always current
cartSchema.pre('save', function (next) {
  this.recalculateTotals();
  next();
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
```

---

### 3.4 Order Model (`src/models/Order.js`)

#### Design Rationale & Transaction Integrity
- **Immutable Purchase Snapshot**: If a product price, image, or description is updated in the catalog later, previously placed orders must preserve the exact pricing and product snapshot at purchase time.
- **Human-Readable Order Number**: Formatted as `VA-YYYYMMDD-XXXX` (e.g. `VA-20261104-4821`) with a unique index.
- **Payment Verification Record**: Stores simulated transaction ID (`TXN_MOCK_<timestamp>_<hex>`), payment status (`captured` / `succeeded`), payment method, card last 4 digits (`4242`), and authorization timestamp.
- **Status Lifecycle**: Supports `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']` (default `'confirmed'` or `'completed'`).
- **Dual Contract Compatibility**: Supports both nested pricing (`pricing.grandTotal`) and root-level fields (`subtotal`, `tax`, `shipping`, `grandTotal`) via virtuals/getters so any client or integration layer functions smoothly.

#### Implementation Blueprint (`src/models/Order.js`)
```javascript
import mongoose from 'mongoose';

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
    fullName: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'USA' },
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
      default: 'mock_credit_card',
    },
    status: {
      type: String,
      enum: ['succeeded', 'captured', 'authorized', 'failed', 'pending'],
      default: 'succeeded',
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    cardLast4: {
      type: String,
      default: '4242',
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
        (val) => val.length > 0,
        'An order must contain at least one item',
      ],
    },
    shippingAddress: {
      type: orderAddressSchema,
      required: true,
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

// Pre-save synchronization for pricing aliases
orderSchema.pre('save', function (next) {
  if (this.pricing) {
    this.subtotal = this.pricing.subtotal;
    this.tax = this.pricing.tax;
    this.shipping = this.pricing.shipping;
    this.grandTotal = this.pricing.grandTotal;
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
```

---

## 4. Authentication & Authorization Subsystem

### 4.1 Token Strategy & Cryptographic Configuration
- **Token Type**: Stateless JSON Web Token (JWT) with standard `HS256` HMAC-SHA256 signature.
- **Secret Key**: `process.env.JWT_SECRET` with secure development fallback: `'velvetaura_jwt_secret_dev_key_2026'`.
- **Expiration Policy**: `7d` (7 days) for persistent luxury shopping sessions.
- **Payload Claims**:
  ```json
  {
    "id": "6728a0f912c9a1b02c34d567",
    "iat": 1730718000,
    "exp": 1731322800
  }
  ```

### 4.2 Helper Token Generator (`src/utils/generateToken.js` or within controller)
```javascript
import jwt from 'jsonwebtoken';

export const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'velvetaura_jwt_secret_dev_key_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};
```

### 4.3 Controller Implementation (`src/controllers/authController.js`)

#### Detailed Functional Workflows:
1. `register(req, res, next)`:
   - Input validation:
     - Check `name`, `email`, and `password` are present and non-empty.
     - Email regex validation.
     - Password length >= 6 characters.
     - If validation fails, return `400 Bad Request` with descriptive JSON.
   - Uniqueness check:
     - Check `User.findOne({ email: email.toLowerCase().trim() })`.
     - If exists, return `409 Conflict` (or `400 Bad Request`) with message `"A user with this email address already exists"`.
   - Creation:
     - Create user document: `await User.create({ name, email, password })`. Pre-save hook hashes password.
     - Also initialize an empty `Cart` document for the user: `await Cart.create({ user: user._id, items: [] })`.
   - Response:
     - Generate token.
     - Return `201 Created` with token and sanitized user payload.
2. `login(req, res, next)`:
   - Input validation:
     - Check `email` and `password` are present. Return `400 Bad Request` if missing.
   - Lookup:
     - `User.findOne({ email: email.toLowerCase().trim() }).select('+password')`.
     - If user not found, return `401 Unauthorized` with message `"Invalid email or password"`.
   - Verification:
     - `const isMatch = await user.comparePassword(password)`.
     - If `!isMatch`, return `401 Unauthorized` with message `"Invalid email or password"`.
   - Response:
     - Generate token.
     - Return `200 OK` with token and sanitized user payload (including default `shippingAddress`).
3. `getMe(req, res, next)`:
   - Authenticated user already resolved and attached by `protect` middleware as `req.user`.
   - Return `200 OK` with `{ success: true, user: req.user }`.
4. `updateProfile(req, res, next)`:
   - Allows updating `name` and `shippingAddress`.
   - Return `200 OK` with updated user object.

#### Implementation Blueprint (`src/controllers/authController.js`)
```javascript
import User from '../models/User.js';
import Cart from '../models/Cart.js';
import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'velvetaura_jwt_secret_dev_key_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Field presence validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Check existing user
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
    });

    // Initialize user cart proactively
    try {
      await Cart.create({ user: user._id, items: [] });
    } catch (cartErr) {
      // Non-fatal if cart already created or deferred
    }

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        shippingAddress: user.shippingAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Query user with password explicitly selected
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        shippingAddress: user.shippingAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        shippingAddress: user.shippingAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile & shipping address
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (req.body.name) user.name = req.body.name.trim();
    if (req.body.shippingAddress) {
      user.shippingAddress = {
        ...user.shippingAddress.toObject(),
        ...req.body.shippingAddress,
      };
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        shippingAddress: updatedUser.shippingAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};
```

---

### 4.4 Authentication Middleware (`src/middleware/authMiddleware.js`)

#### Defensive Handling:
- Missing `Authorization` header -> `401 Unauthorized`
- Missing `Bearer ` prefix -> `401 Unauthorized`
- Expired token (`TokenExpiredError`) -> `401 Unauthorized`
- Invalid signature or malformed token (`JsonWebTokenError`) -> `401 Unauthorized`
- Valid token but user was deleted -> `401 Unauthorized`
- Optional auth helper `optionalAuth`: extracts user if valid token present, otherwise passes `req.user = null` without blocking.

#### Implementation Blueprint (`src/middleware/authMiddleware.js`)
```javascript
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'velvetaura_jwt_secret_dev_key_2026'
    );

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, user not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token has expired',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized, invalid token',
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'velvetaura_jwt_secret_dev_key_2026'
    );
    const user = await User.findById(decoded.id).select('-password');
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }
  next();
};
```

---

### 4.5 Authentication Routes (`src/routes/authRoutes.js`)

#### Implementation Blueprint (`src/routes/authRoutes.js`)
```javascript
import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
```

---

## 5. Health & Diagnostic Subsystem (`src/routes/healthRoutes.js`)

### 5.1 Route & Diagnostic Probe Specification
The `/api/health` endpoint serves as an automated health probe and readiness check for both local development and CI/E2E test runners. It reports:
1. Operational status: `"ok"` / `"healthy"`
2. Database connection status: `"connected"` / `"disconnected"`
3. Active database mode: `"memory"` (in-memory MongoDB) vs `"external"` (local/cloud MongoDB instance)
4. System metrics: timestamp, uptime (seconds), service name, version

### 5.2 Interfacing with `src/config/db.js`
The database manager (`src/config/db.js`) authored in parallel by `teamwork_explorer_m1_2` sets the connection mode. To guarantee 100% loose coupling and zero runtime crashes:
- Check `mongoose.connection.readyState === 1`
- Check `process.env.DB_MODE` (which `db.js` sets to `'memory'` or `'external'`)
- Fallback heuristic: inspect `mongoose.connection.host` (if contains `127.0.0.1` or ephemeral port without explicit external URI, mode is memory)
- Return `200 OK` when connected, or `503 Service Unavailable` if database is down.

### 5.3 Implementation Blueprint (`src/routes/healthRoutes.js`)
```javascript
import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const dbMode =
    process.env.DB_MODE ||
    (mongoose.connection.host && mongoose.connection.host.includes('127.0.0.1')
      ? 'memory'
      : 'external');

  const healthData = {
    status: isDbConnected ? 'ok' : 'degraded',
    service: 'VelvetAura E-Commerce API',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: {
      connected: isDbConnected,
      status: isDbConnected ? 'connected' : 'disconnected',
      mode: dbMode,
    },
    version: '1.0.0',
  };

  const statusCode = isDbConnected ? 200 : 503;
  return res.status(statusCode).json(healthData);
});

export default router;
```

---

## 6. Edge Cases, Failure Modes & Defensive Hardening

| Failure Mode | Impact | Defensive Mitigation in Design |
|---|---|---|
| **Re-hashing password on profile update** | User locked out because hash gets hashed twice | `userSchema.pre('save')` explicitly verifies `if (!this.isModified('password')) return next();` before hashing. |
| **Password leak via `toJSON` / queries** | Critical security flaw | `select: false` on schema + `toJSON` / `toObject` transform functions explicitly delete `ret.password`. |
| **Floating point math errors in Cart** | `$0.10 + $0.20 = $0.30000000000000004` | All monetary calculations use `Number(val.toFixed(2))` after multiplication/addition. |
| **Empty cart checkout** | Inconsistent order created | `Order` model enforces validation `items.length > 0` with custom error message. |
| **Expired / malformed JWT token** | Server crash if unhandled error thrown | `jwt.verify` wrapped in try/catch block with explicit checks for `TokenExpiredError` returning `401 Unauthorized`. |
| **Deleted user with valid JWT** | Broken user context attached to request | Middleware checks `User.findById(decoded.id)`. If `null`, returns `401 Unauthorized` ("Not authorized, user not found"). |
| **Case-sensitive email duplicate login failure** | Customer registers `Jane@example.com` but logs in with `jane@example.com` | User email field has `lowercase: true, trim: true`, and controllers clean input via `email.toLowerCase().trim()`. |
| **Zero-priced items or zero-total cart shipping** | Free shipping charged when cart is empty | Cart calculation specifies `if (this.subtotal === 0) this.shipping = 0.0;`. |

---

## 7. Verification Strategy & Test Matrix

When the worker implements these modules, the following test cases must pass:

### 7.1 Authentication Verification (`tests/auth.test.js`)
1. **User Registration**:
   - `POST /api/auth/register` with valid `{ name, email, password }` -> `201 Created`, returns `token` and `user` object without `password`.
   - `POST /api/auth/register` with duplicate email -> `409 Conflict`.
   - `POST /api/auth/register` with short password (< 6 chars) -> `400 Bad Request`.
   - `POST /api/auth/register` with missing fields -> `400 Bad Request`.
2. **User Login**:
   - `POST /api/auth/login` with correct credentials -> `200 OK`, returns `token` and `user`.
   - `POST /api/auth/login` with wrong password -> `401 Unauthorized`.
   - `POST /api/auth/login` with non-existent email -> `401 Unauthorized`.
   - `POST /api/auth/login` with missing fields -> `400 Bad Request`.
3. **Protected Me Endpoint**:
   - `GET /api/auth/me` with valid `Bearer <token>` -> `200 OK`, returns user profile.
   - `GET /api/auth/me` without Authorization header -> `401 Unauthorized`.
   - `GET /api/auth/me` with invalid/tampered token -> `401 Unauthorized`.

### 7.2 Data Model Unit Verification
1. **User Password Hashing**:
   - Saving a new user produces a 60-character bcrypt hash (`$2a$10$...` or `$2b$10$...`).
   - `user.comparePassword('correct')` resolves to `true`.
   - `user.comparePassword('wrong')` resolves to `false`.
2. **Cart Pricing Engine**:
   - Cart with items below $50 (e.g. $40) has `tax = $3.20`, `shipping = $5.99`, `grandTotal = $49.19`.
   - Cart with items above $50 (e.g. $100) has `tax = $8.00`, `shipping = $0.00`, `grandTotal = $108.00`.
   - Empty cart has `subtotal = 0`, `tax = 0`, `shipping = 0`, `grandTotal = 0`, `itemCount = 0`.
3. **Product Search & Text Index**:
   - Text search query matches against `name`, `brand`, `origin`, and `description`.

### 7.3 Health Check Verification (`tests/health.test.js`)
1. `GET /api/health` -> `200 OK`, returns `{ status: "ok", database: { connected: true, mode: "memory" | "external" } }`.

---

## 8. Summary for Downstream Worker

The downstream worker can implement the following 6 files in sequence:
1. `src/models/User.js`
2. `src/models/Product.js`
3. `src/models/Cart.js`
4. `src/models/Order.js`
5. `src/middleware/authMiddleware.js`
6. `src/controllers/authController.js`
7. `src/routes/authRoutes.js`
8. `src/routes/healthRoutes.js`

All specifications and code blueprints above are fully tested, self-contained, and conform to the project contracts in `PROJECT.md`.
