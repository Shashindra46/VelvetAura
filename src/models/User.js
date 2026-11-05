/**
 * VelvetAura - User Data Model
 * Handles user identity, credentials, role definition, shipping address,
 * and transparent bcryptjs pre-save password hashing.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    zip: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'USA' },
    // Aliases for compatibility
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    fullName: { type: String, trim: true, default: '' },
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
    address: {
      type: addressSchema,
      default: () => ({}),
    },
    shippingAddress: {
      type: addressSchema,
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

// Pre-save hook: password hashing and address synchronization
userSchema.pre('save', async function (next) {
  // Synchronize address and shippingAddress if one is populated
  if (this.address && this.address.street && (!this.shippingAddress || !this.shippingAddress.street)) {
    this.shippingAddress = { ...this.address.toObject?.() || this.address };
  } else if (this.shippingAddress && this.shippingAddress.street && (!this.address || !this.address.street)) {
    this.address = { ...this.shippingAddress.toObject?.() || this.shippingAddress };
  }

  // Only hash password if it was modified (or is new)
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

/**
 * Compare entered plaintext password with the stored bcrypt hash
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    throw new Error('Password field not selected in query');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Alternate alias for comparePassword
 */
userSchema.methods.matchPassword = function (candidatePassword) {
  return this.comparePassword(candidatePassword);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
