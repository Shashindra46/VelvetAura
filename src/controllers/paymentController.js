/**
 * VelvetAura - Payment Controller
 * Handles PayHere payment gateway webhook (IPN / Notify) callbacks,
 * signature verification, order payment status mutation, and public gateway config.
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const {
  verifyPayHereSignature,
  mapPayHereStatus,
  getPayHereConfig,
} = require('../services/payhereService');

/**
 * @desc    PayHere IPN (Instant Payment Notification) Webhook
 * @route   POST /api/payments/payhere/notify
 * @access  Public (Signature-verified)
 */
const handlePayHereNotify = async (req, res, next) => {
  try {
    const payload = req.body;

    // 1. Signature verification
    const isValidSignature = verifyPayHereSignature(payload);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PayHere signature',
      });
    }

    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      status_message,
      method,
    } = payload;

    // 2. Merchant validation
    const config = getPayHereConfig();
    if (merchant_id && config.merchantId && merchant_id !== config.merchantId) {
      return res.status(400).json({
        success: false,
        message: 'Merchant ID mismatch',
      });
    }

    // 3. Find order by orderNumber or _id
    let orderQuery = [{ orderNumber: order_id }];
    if (typeof order_id === 'string' && /^[0-9a-fA-F]{24}$/.test(order_id)) {
      orderQuery.push({ _id: order_id });
    }

    const order = await Order.findOne({ $or: orderQuery });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const newPaymentStatus = mapPayHereStatus(status_code);

    // 4. Idempotency and State Transition Guards

    // 4a. If order is already paid, ignore duplicate success or late/stale cancel/fail/pending notifications
    if (order.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message:
          Number(status_code) === 2
            ? 'Order already marked as paid'
            : 'Order already paid; ignoring stale or conflicting status notification',
        orderId: order.orderNumber,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
      });
    }

    // 4b. If order is already failed or cancelled, ignore duplicate failure callbacks
    // to prevent double inventory rollback and redundant updates
    const wasAlreadyFailed =
      order.paymentStatus === 'failed' || order.status === 'cancelled';
    if (newPaymentStatus === 'failed' && wasAlreadyFailed) {
      return res.status(200).json({
        success: true,
        message:
          'Order already marked as failed/cancelled; duplicate notification ignored',
        orderId: order.orderNumber,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
      });
    }

    // 5. Update Order payment status and fields
    order.paymentMethod = 'payhere';
    order.paymentStatus = newPaymentStatus;
    order.gatewayTransactionId = payment_id || order.gatewayTransactionId || `PH-VA-${order_id}`;
    order.gatewayHash = md5sig || order.gatewayHash;

    if (!order.payment) {
      order.payment = {};
    }
    order.payment.method = 'payhere';
    order.payment.status = newPaymentStatus;
    order.payment.transactionId = order.gatewayTransactionId;
    order.payment.payherePaymentId = payment_id || null;
    order.payment.payhereHash = md5sig || null;
    order.payment.gatewayTransactionId = order.gatewayTransactionId;
    order.payment.gatewayHash = order.gatewayHash;

    if (newPaymentStatus === 'paid') {
      order.payment.paidAt = new Date();
      order.status = 'processing';
      order.paymentNotes = `Paid via PayHere gateway (${method || 'Card'}). Payment ID: ${payment_id || 'N/A'}`;
    } else if (newPaymentStatus === 'failed') {
      order.status = 'cancelled';
      order.paymentNotes = `PayHere payment failed or canceled: ${status_message || 'Status ' + status_code}`;

      // Stock rollback compensation strictly on initial transition to failed/cancelled
      if (!wasAlreadyFailed && order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.product && item.quantity) {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { stock: item.quantity },
            });
          }
        }
      }
    } else {
      order.paymentNotes = `PayHere payment pending review. Status code: ${status_code}`;
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'PayHere notification processed successfully',
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get public PayHere configuration
 * @route   GET /api/payments/payhere/config
 * @access  Public
 */
const getPayHerePublicConfig = (req, res) => {
  const config = getPayHereConfig();
  res.status(200).json({
    success: true,
    data: {
      merchantId: config.merchantId,
      mode: config.mode,
      currency: config.currency,
      checkoutUrl: config.checkoutUrl,
    },
  });
};

module.exports = {
  handlePayHereNotify,
  getPayHerePublicConfig,
};
