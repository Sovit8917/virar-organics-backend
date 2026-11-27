const bcrypt = require('bcryptjs');
const env = require('../config/env');

const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Used to keep login timing similar when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('virar-dummy-password', 10);

module.exports = { hashPassword, comparePassword, DUMMY_HASH };
