// server/tests/env.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secretcc-do-not-use-in-prod';
process.env.GATEWAY_KEY = process.env.GATEWAY_KEY || 'gw_dev_local_change_me';
process.env.REDACTOR_URL = (process.env.REDACTOR_URL || 'http://127.0.0.1:4000').replace('localhost', '127.0.0.1');
process.env.GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:8090').replace('localhost', '127.0.0.1');
