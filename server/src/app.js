const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const policyRoutes = require('./routes/policyRoutes');
const userRoutes = require('./routes/userRoutes');
const statsRoutes = require('./routes/statsRoutes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler); // 4-arg error handler, last

module.exports = app; // <-- export, do NOT listen here