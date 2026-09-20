const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (res.headersSent) {
    return next(err);
  }

  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    return res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Safely render view error, or fallback to clean HTML if template rendering fails
  try {
    res.status(statusCode).render('error', {
      title: 'Error Encountered',
      message,
      statusCode,
      activePage: '',
    }, (renderErr, html) => {
      if (renderErr) {
        console.error('Error rendering error view:', renderErr);
        return res.status(statusCode).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Application Notice - Nirmana</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
              body { background: #f8fafc; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; }
              .error-box { max-width: 580px; width: 100%; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); text-align: center; }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h3 class="text-danger mb-3">Notice</h3>
              <p class="text-secondary mb-4">${message}</p>
              <a href="/upload" class="btn btn-primary px-4 py-2">Go to Customer Upload</a>
            </div>
          </body>
          </html>
        `);
      }
      res.status(statusCode).send(html);
    });
  } catch (renderEx) {
    console.error('Fatal render exception:', renderEx);
    res.status(statusCode).send(`<h1>Notice</h1><p>${message}</p>`);
  }
};

module.exports = errorHandler;
