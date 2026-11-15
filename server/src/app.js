const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));
app.use(errorHandler);

module.exports = app;