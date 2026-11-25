module.exports = (err, req, res, next) => {
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id format' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate value',
      code: 'DUPLICATE',
      fields: Object.keys(err.keyPattern || {}),
    });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
};