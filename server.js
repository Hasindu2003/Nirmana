const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./src/config/config');
const sequelize = require('./src/config/database');
const apiRoutes = require('./src/routes/api');
const viewRoutes = require('./src/routes/viewRoutes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// 1. Basic Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 2. Session Configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    secure: config.nodeEnv === 'production',
  },
}));

// 3. Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 4. View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// 5. Global View Variables (Safe Defaults)
app.use((req, res, next) => {
  res.locals.appName = config.appName;
  res.locals.currencySymbol = config.currencySymbol;
  res.locals.currentUser = null;
  res.locals.currentPath = req.path;
  res.locals.activePage = '';
  res.locals.title = 'Nirmana Printing Management System';
  next();
});

// 6. Routes
app.use('/api', apiRoutes);
app.use('/', viewRoutes);

// 7. 404 Handler
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The requested page does not exist or has been moved.',
    statusCode: 404,
    activePage: '',
  });
});

// 8. Error Handler
app.use(errorHandler);

// 9. Database Connection & Start Server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log(`✓ Database connection established successfully (${config.db.dialect}).`);

    // Sync new QuickPrint tables safely without affecting existing data
    const { QuickPrintJob, QuickPrintFile } = require('./src/models');
    await QuickPrintJob.sync();
    await QuickPrintFile.sync();
    console.log('✓ Quick Print database tables synchronized.');

    const { getPrimaryLanIp } = require('./src/utils/network');
    const lanIp = getPrimaryLanIp();

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(`🚀 ${config.appName} is running!`);
      console.log(`📡 Local:      http://localhost:${config.port}`);
      if (lanIp) {
        console.log(`📱 Wi-Fi/LAN:  http://${lanIp}:${config.port}`);
      }
      console.log(`⚙️  Environment: ${config.nodeEnv}`);
      console.log(`📦 Database:    ${config.db.dialect}`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
