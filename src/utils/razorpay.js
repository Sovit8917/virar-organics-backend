const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const safeEqualHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const assertRazorpayKeys = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Razorpay credentials are not configured on the server');
  }
};

const createRazorpayOrder = async ({ amountInPaise, receipt, notes = {} }) => {
  assertRazorpayKeys();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.description || 'Failed to create Razorpay order';
    throw new ApiError(502, msg);
  }
  return data;
};

const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  assertRazorpayKeys();
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return safeEqualHex(expected, razorpaySignature);
};

const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiError(503, 'Razorpay webhook secret is not configured on the server');
  }
  if (!signatureHeader || !Buffer.isBuffer(rawBody)) return false;

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signatureHeader);
};

module.exports = {
  safeEqualHex,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
