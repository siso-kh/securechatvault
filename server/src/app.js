const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middlewares/errorHandler');
const conversationRoutes = require('./routes/conversationRoutes');
const chatRoutes = require('./routes/chatRoutes');
const statsRoutes = require('./routes/statsRoutes');
const policyRoutes = require('./routes/policyRoutes');
const userRoutes = require('./routes/userRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/chat', chatRoutes);                     // ← new
app.use('/api/stats', statsRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));
app.use(errorHandler);

module.exports = app;