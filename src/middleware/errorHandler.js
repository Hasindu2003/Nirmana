const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    return res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Render view error if view route
  res.status(statusCode).render('error', {
    title: 'Error Encountered',
    message,
    statusCode,
  });
};

module.exports = errorHandler;
