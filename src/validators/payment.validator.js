const { z } = require('./common');

const verifyRazorpay = z.object({
  orderId: z.string().uuid('Invalid orderId'),
  razorpayOrderId: z.string().trim().min(1, 'razorpayOrderId is required').max(100),
  razorpayPaymentId: z.string().trim().min(1, 'razorpayPaymentId is required').max(100),
  razorpaySignature: z.string().trim().min(1, 'razorpaySignature is required').max(256),
});

module.exports = { verifyRazorpay };
