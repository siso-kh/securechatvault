const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); // repo root

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

connectDB(); // fire and forget; logs success/failure
app.listen(PORT, () => console.log(`API on :${PORT}`));