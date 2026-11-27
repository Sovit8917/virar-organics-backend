const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signToken = (user) =>
  jwt.sign({ sub: user.id, tv: user.tokenVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'virar-organics',
  });

const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET, { issuer: 'virar-organics' });

module.exports = { signToken, verifyToken };
