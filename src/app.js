const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: true }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// NOTE (Phase 4): the Razorpay webhook route needs the RAW request body for signature
// verification, so it will be mounted BEFORE this JSON parser.
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
