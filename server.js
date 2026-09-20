const express = require('express');
const path = require('path');
const fs = require('fs');
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

// Trust reverse proxies (essential for Vercel HTTPS & secure cookies)
app.set('trust proxy', 1);

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
if (process.env.VERCEL) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads')));
}
app.use(express.static(path.join(__dirname, 'public')));

// 4. View Engine (EJS)
app.set('view engine', 'ejs');
const viewsPath = fs.existsSync(path.join(__dirname, 'src', 'views'))
  ? path.join(__dirname, 'src', 'views')
  : path.join(process.cwd(), 'src', 'views');
app.set('views', viewsPath);

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

// 5.1 Health Check (Guarantees instant 200 OK for uptime & Vercel verification)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Nirmana service is operational',
    environment: config.nodeEnv,
    isVercel: Boolean(process.env.VERCEL),
    dbDialect: config.db.dialect,
    dbInitialized: isDbInitialized,
    dbError: dbInitError ? dbInitError.message : null,
    timestamp: new Date().toISOString(),
  });
});

// 5.5 Database Auto-Initialization (ensures DB & default admin exist on both serverless & local)
let isDbInitialized = false;
let initPromise = null;
let dbInitError = null;

async function ensureDbInitialized() {
  if (isDbInitialized) return true;
  if (dbInitError) return false;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await sequelize.authenticate();
        await sequelize.sync();

        // Seed default admin if User table is empty (e.g. fresh ephemeral /tmp SQLite on Vercel)
        const { User } = require('./src/models');
        const adminCount = await User.count().catch(() => 0);
        if (adminCount === 0) {
          await User.create({
            username: 'admin',
            email: 'admin@nirmana.lk',
            password: 'Password123!',
            fullName: 'Nirmana Shop Manager',
            role: 'ADMIN',
            phone: '0771234567',
            isActive: true,
          });
          console.log('✓ Initialized default admin user (admin / Password123!).');
        }
        isDbInitialized = true;
        return true;
      } catch (err) {
        console.error('Database connection / initialization failed:', err);
        dbInitError = err;
        return false;
      }
    })();
  }
  return initPromise;
}

app.use(async (req, res, next) => {
  const ready = await ensureDbInitialized();
  if (!ready && dbInitError) {
    if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed: ' + dbInitError.message,
        hint: 'On Vercel, connect a managed cloud MySQL database via environment variables: DB_DIALECT=mysql, DB_HOST, DB_USER, DB_PASS, DB_NAME (or DATABASE_URL).'
      });
    }
    return next(new Error(`Database connection failed: ${dbInitError.message}. If running on Vercel, please configure cloud database environment variables.`));
  }
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
    await ensureDbInitialized();
    console.log(`✓ Database connection established successfully (${config.db.dialect}).`);

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
