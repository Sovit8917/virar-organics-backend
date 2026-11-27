const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const paymentController = require('./controllers/payment.controller');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: true }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// Razorpay webhook requires the raw request body for HMAC-SHA256 signature verification,
// so it is mounted before express.json().
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), paymentController.razorpayWebhook);

app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
