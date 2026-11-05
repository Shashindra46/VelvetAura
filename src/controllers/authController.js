/**
 * VelvetAura - Authentication Controller
 * Handles user registration, credential validation & JWT issuance,
 * profile retrieval, and profile updates.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Cart = require('../models/Cart');

/**
 * Generate stateless JWT token
 * @param {string|mongoose.Types.ObjectId} id - User ObjectId
 * @returns {string} Signed JWT
 */
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'velvetaura_luxury_secret_jwt_key_2026_secure',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * @desc    Register a new customer account
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, address, shippingAddress } = req.body;

    // Field presence validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
        error: 'Please provide name, email, and password',
      });
    }

    // Type validation: name, email, and password must be strings
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password must be valid strings',
        error: 'Name, email, and password must be valid strings',
      });
    }

    // Check trimmed name is not blank
    if (name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid name',
        error: 'Please provide a valid name',
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        error: 'Password must be at least 6 characters long',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
        error: 'Please provide a valid email address',
      });
    }

    // Check for existing user with identical email
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists',
        error: 'A user with this email address already exists',
      });
    }

    // Create user in database (pre-save hook hashes password)
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      address: address || shippingAddress || {},
      shippingAddress: shippingAddress || address || {},
    });

    // Proactively initialize an empty cart for the new user
    try {
      await Cart.create({ user: user._id, items: [] });
    } catch (cartErr) {
      // Non-fatal if cart creation fails or already exists
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
        address: user.address,
        shippingAddress: user.shippingAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate customer credentials and return JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
        error: 'Please provide both email and password',
      });
    }

    // Type validation: email and password must be strings
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email and password must be valid strings',
        error: 'Email and password must be valid strings',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Query user with password hash explicitly selected
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: 'Invalid email or password',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: 'Invalid email or password',
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
        address: user.address,
        shippingAddress: user.shippingAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently authenticated customer profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User not found',
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
        address: user.address,
        shippingAddress: user.shippingAddress,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update customer profile details and shipping address
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User not found',
      });
    }

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Name must be a valid non-empty string',
          error: 'Name must be a valid non-empty string',
        });
      }
      user.name = req.body.name.trim();
    }

    if (req.body.address || req.body.shippingAddress) {
      const newAddress = req.body.address || req.body.shippingAddress;
      user.address = {
        ...(user.address && typeof user.address.toObject === 'function' ? user.address.toObject() : user.address),
        ...newAddress,
      };
      user.shippingAddress = {
        ...(user.shippingAddress && typeof user.shippingAddress.toObject === 'function' ? user.shippingAddress.toObject() : user.shippingAddress),
        ...newAddress,
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
        address: updatedUser.address,
        shippingAddress: updatedUser.shippingAddress,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
};
