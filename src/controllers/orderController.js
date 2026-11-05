/**
 * VelvetAura - Order & Checkout Controller
 * 
 * Manages order creation, atomic inventory decrement with rollback compensation,
 * mock payment authorization, order history retrieval, and individual order viewing.
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { processPayment } = require('../services/paymentService');
const { generatePayHereHash } = require('../services/payhereService');

/**
 * @desc    Submit checkout, authorize payment, decrement stock, and create order
 * @route   POST /api/orders/checkout
 * @access  Private
 */
const checkout = async (req, res, next) => {
  const decrementedItems = [];

  try {
    const {
      shippingAddress,
      paymentMethod,
      paymentDetails,
      bankTransferConfirmed,
      paymentNotes,
    } = req.body;

    // 1. Fetch user active cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot checkout with an empty cart',
        error: 'Cart is empty',
      });
    }

    // 2. Validate Shipping Address
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Shipping address is required',
        error: 'Missing shipping address',
      });
    }

    const street = (shippingAddress.street || shippingAddress.addressLine1 || '').trim();
    const city = (shippingAddress.city || '').trim();
    const state = (shippingAddress.state || '').trim();
    const zip = (shippingAddress.zip || shippingAddress.postalCode || '').trim();
    const country = (shippingAddress.country || '').trim();

    if (!street || !city || !state || !zip || !country) {
      return res.status(400).json({
        success: false,
        message: 'Incomplete shipping address. Street, city, state, zip, and country are required.',
        error: 'Incomplete shipping address',
      });
    }

    // 3. Resolve and validate payment method
    let resolvedMethod = (paymentMethod || paymentDetails?.method || '').toLowerCase().trim();
    if (!resolvedMethod) {
      if (paymentDetails && paymentDetails.cardNumber) {
        resolvedMethod = 'mock_credit_card';
      } else {
        return res.status(400).json({
          success: false,
          message: 'Payment details or payment method are required',
          error: 'Missing payment details',
        });
      }
    }

    const validMethods = ['cod', 'bank_transfer', 'payhere', 'mock_credit_card'];
    if (!validMethods.includes(resolvedMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method: ${resolvedMethod}. Allowed: ${validMethods.join(', ')}`,
        error: 'Invalid payment method',
      });
    }

    // For Bank Transfer, validate confirmation
    if (resolvedMethod === 'bank_transfer') {
      const isConfirmed =
        bankTransferConfirmed === true ||
        paymentDetails?.confirmed === true ||
        paymentDetails?.confirmedTransfer === true;
      if (!isConfirmed) {
        return res.status(400).json({
          success: false,
          message: 'Confirmation of bank transfer is required before placing order',
          error: 'Confirmation of bank transfer is required',
        });
      }
    }

    // 4. Atomic Inventory Stock Decrement
    let stockSufficient = true;
    let failedItem = null;

    for (const item of cart.items) {
      const productId = item.product?._id || item.product;
      const quantityToDeduct = Number(item.quantity) || 1;

      // Atomically decrement stock if available
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantityToDeduct } },
        { $inc: { stock: -quantityToDeduct } },
        { new: true }
      );

      if (!updatedProduct) {
        stockSufficient = false;
        failedItem = item;
        break;
      }

      decrementedItems.push({
        productId,
        quantity: quantityToDeduct,
      });
    }

    // Rollback decremented stock if any item had insufficient stock
    if (!stockSufficient) {
      for (const dec of decrementedItems) {
        await Product.findByIdAndUpdate(dec.productId, {
          $inc: { stock: dec.quantity },
        });
      }

      return res.status(400).json({
        success: false,
        message: `Insufficient inventory for product "${failedItem?.name || 'Item'}". Stock was depleted or insufficient.`,
        error: 'Insufficient stock',
      });
    }

    // 5. Handle payment authorization / setup
    let transactionId;
    let resolvedPaymentStatus = 'pending';
    let resolvedOrderStatus = 'pending';
    let resolvedPaidAt = null;
    let resolvedCardLast4 = '';
    let gatewayHash = null;
    let resolvedNotes = paymentNotes || (typeof paymentDetails?.notes === 'string' ? paymentDetails.notes : '');
    let resolvedBankDetails = {
      bankName: 'Commercial Bank of Ceylon',
      branch: 'Colombo Fort Premier Branch',
      accountName: 'VelvetAura (Pvt) Ltd',
      accountNumber: '1000 8924 7712',
      confirmed: false,
    };

    if (resolvedMethod === 'cod') {
      transactionId = `COD-VA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      resolvedPaymentStatus = 'pending';
      resolvedOrderStatus = 'pending';
      resolvedPaidAt = null;
      resolvedNotes = resolvedNotes || 'Cash on Delivery. Collect payment at doorstep.';
    } else if (resolvedMethod === 'bank_transfer') {
      transactionId = `BT-VA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      resolvedPaymentStatus = 'pending';
      resolvedOrderStatus = 'pending';
      resolvedPaidAt = null;
      resolvedBankDetails.confirmed = true;
      resolvedNotes = resolvedNotes || 'Direct Bank Transfer to Commercial Bank of Ceylon. Awaiting bank verification.';
    } else if (resolvedMethod === 'payhere') {
      transactionId = `PH-VA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      resolvedPaymentStatus = 'pending';
      resolvedOrderStatus = 'pending';
      resolvedPaidAt = null;
      resolvedNotes = resolvedNotes || 'PayHere checkout pending customer payment.';
    } else if (resolvedMethod === 'mock_credit_card') {
      // Legacy mock credit card processing for tests
      const paymentResult = await processPayment(cart.grandTotal, paymentDetails || {});
      if (!paymentResult.success) {
        // Rollback decremented stock
        for (const dec of decrementedItems) {
          await Product.findByIdAndUpdate(dec.productId, {
            $inc: { stock: dec.quantity },
          });
        }

        return res.status(paymentResult.statusCode || 402).json({
          success: false,
          message: paymentResult.error || 'Payment authorization declined',
          error: paymentResult.error || 'Payment failed',
          code: paymentResult.code,
        });
      }
      transactionId = paymentResult.transactionId;
      resolvedPaymentStatus = 'paid';
      resolvedOrderStatus = 'completed';
      resolvedPaidAt = paymentResult.paidAt || new Date();
      resolvedCardLast4 = paymentResult.cardLast4 || '4242';
    }

    // 6. Create immutable order record with frozen product snapshots
    const orderItems = cart.items.map((item) => ({
      product: item.product?._id || item.product,
      name: item.name,
      brand: item.brand,
      origin: item.origin || '',
      price: item.price,
      quantity: item.quantity,
      image: item.image || '',
    }));

    const formattedAddress = {
      fullName: (shippingAddress.fullName || req.user.name || '').trim(),
      street,
      addressLine1: street,
      addressLine2: (shippingAddress.addressLine2 || '').trim(),
      city,
      state,
      zip,
      postalCode: zip,
      country,
      phone: (shippingAddress.phone || '').trim(),
    };

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `VA-${dateStr}-${randomSuffix}`;

    if (resolvedMethod === 'payhere') {
      try {
        gatewayHash = generatePayHereHash({
          merchantId: process.env.PAYHERE_MERCHANT_ID || '1211149',
          orderId: orderNumber,
          amount: cart.grandTotal,
          currency: 'LKR',
          merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || 'SecretKeyPayHere',
        });
      } catch (err) {
        // Continue
      }
    }

    const order = await Order.create({
      orderNumber,
      user: req.user._id,
      items: orderItems,
      shippingAddress: formattedAddress,
      currency: 'LKR',
      pricing: {
        subtotal: cart.subtotal,
        tax: cart.tax,
        shipping: cart.shipping,
        grandTotal: cart.grandTotal,
      },
      subtotal: cart.subtotal,
      tax: cart.tax,
      shipping: cart.shipping,
      grandTotal: cart.grandTotal,
      paymentMethod: resolvedMethod,
      paymentStatus: resolvedPaymentStatus,
      gatewayTransactionId: transactionId,
      gatewayHash: gatewayHash || null,
      paymentNotes: resolvedNotes,
      payment: {
        transactionId,
        method: resolvedMethod,
        status: resolvedPaymentStatus === 'paid' ? 'succeeded' : resolvedPaymentStatus,
        paidAt: resolvedPaidAt,
        cardLast4: resolvedCardLast4,
        bankDetails: resolvedBankDetails,
        gatewayTransactionId: transactionId,
        gatewayHash: gatewayHash || null,
        notes: resolvedNotes,
      },
      status: resolvedOrderStatus,
    });

    // 7. Clear user active cart after successful order creation
    cart.items = [];
    cart.recalculateTotals();
    await cart.save();

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order,
      transactionId,
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    // If unexpected exception occurs after partial decrement, rollback stock
    if (decrementedItems.length > 0) {
      try {
        for (const dec of decrementedItems) {
          await Product.findByIdAndUpdate(dec.productId, {
            $inc: { stock: dec.quantity },
          });
        }
      } catch (rollbackErr) {
        console.error('[Checkout] Stock rollback error:', rollbackErr);
      }
    }
    next(error);
  }
};

/**
 * @desc    Get order history for authenticated customer
 * @route   GET /api/orders/my-orders
 * @access  Private
 */
const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single order details by ID (owner or admin only)
 * @route   GET /api/orders/:id
 * @access  Private
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
        error: 'Invalid order ID format',
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error: 'Order not found',
      });
    }

    // Verify ownership
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order',
        error: 'Forbidden',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all customer orders (admin oversight)
 * @route   GET /api/orders
 * @access  Private/Admin
 */
const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update order fulfillment status (admin only)
 * @route   PUT /api/orders/:id/status
 * @access  Private/Admin
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, paymentNotes, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
        error: 'Invalid order ID format',
      });
    }

    if (!status && !paymentStatus && !paymentNotes && !notes) {
      return res.status(400).json({
        success: false,
        message: 'No status or payment fields provided for update',
        error: 'Missing update fields',
      });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];
    let cleanStatus = null;
    if (status !== undefined) {
      cleanStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
      if (!cleanStatus || !validStatuses.includes(cleanStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid order status. Allowed: ${validStatuses.join(', ')}`,
          error: 'Invalid order status',
        });
      }
    }

    let cleanPaymentStatus = null;
    if (paymentStatus !== undefined) {
      const validPaymentStatuses = ['pending', 'paid', 'failed'];
      cleanPaymentStatus = typeof paymentStatus === 'string' ? paymentStatus.trim().toLowerCase() : '';
      if (!cleanPaymentStatus || !validPaymentStatuses.includes(cleanPaymentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Allowed: ${validPaymentStatuses.join(', ')}`,
          error: 'Invalid payment status',
        });
      }
    }

    const order = await Order.findById(id).populate('user', 'name email role');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error: 'Order not found',
      });
    }

    if (cleanStatus) {
      order.status = cleanStatus;
    }

    if (cleanPaymentStatus) {
      order.paymentStatus = cleanPaymentStatus;
      if (!order.payment) order.payment = {};
      order.payment.status = cleanPaymentStatus;
      if (cleanPaymentStatus === 'paid') {
        order.payment.paidAt = order.payment.paidAt || new Date();
      } else if (cleanPaymentStatus === 'pending') {
        order.payment.paidAt = null;
      }
    }

    if (paymentNotes || notes) {
      order.paymentNotes = (paymentNotes || notes).trim();
      if (order.payment) {
        order.payment.notes = order.paymentNotes;
      }
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order status updated successfully`,
      order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkout,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
};
