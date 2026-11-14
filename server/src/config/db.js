const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/securechat';

module.exports = function connectDB() {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('Mongo not reachable yet:', err.message));
};