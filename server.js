// Enforce Sri Lanka timezone across Node.js runtime (Asia/Colombo, UTC+05:30)
process.env.TZ = 'Asia/Colombo';

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const compression = require('compression');

// User in-memory micro-cache (60s TTL) to eliminate redundant database queries
const userCache = new Map();
const USER_CACHE_TTL = 60 * 1000;

async function getCachedUser(userId) {
  const cached = userCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < USER_CACHE_TTL)) {
    return cached.user;
  }
  try {
    const { User } = require('./src/models');
    const user = await User.findByPk(userId);
    if (user) {
      userCache.set(userId, { user, timestamp: Date.now() });
    }
    return user;
  } catch (e) {
    return null;
  }
}

const config = require('./src/config/config');
const sequelize = require('./src/config/database');
const apiRoutes = require('./src/routes/api');
const viewRoutes = require('./src/routes/viewRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const {
  formatSriLankaDate,
  formatSriLankaDateTime,
  formatSriLankaTime,
  getSriLankaTodayString,
} = require('./src/utils/dateUtils');

const app = express();

// Trust reverse proxies (essential for Vercel HTTPS & secure cookies)
app.set('trust proxy', 1);

// 1. Basic Middleware
app.use(compression());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 2. Session Configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Handled dynamically via reverse proxy
  },
}));

// 3. Static Files with Aggressive Browser Caching
if (process.env.VERCEL) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads'), { maxAge: '1d' }));
}
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.nodeEnv === 'production' ? '7d' : '1h',
  etag: true,
}));

// 4. View Engine (EJS)
app.set('view engine', 'ejs');
const viewsPath = fs.existsSync(path.join(__dirname, 'src', 'views'))
  ? path.join(__dirname, 'src', 'views')
  : path.join(process.cwd(), 'src', 'views');
app.set('views', viewsPath);

// 5. Global View Variables (Safe Defaults) & User Session Auto-Loader
app.use(async (req, res, next) => {
  res.locals.appName = config.appName;
  res.locals.currencySymbol = config.currencySymbol;
  res.locals.currentUser = null;
  res.locals.currentPath = req.path;
  res.locals.activePage = '';
  res.locals.title = 'Nirmana Printing Management System';
  res.locals.formatDate = formatSriLankaDate;
  res.locals.formatDateTime = formatSriLankaDateTime;
  res.locals.formatTime = formatSriLankaTime;
  res.locals.todayDate = getSriLankaTodayString;

  try {
    let userId = null;
    const token = req.cookies && req.cookies.auth_token;
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded && decoded.id) {
          userId = decoded.id;
        }
      } catch (e) {}
    }
    if (!userId && req.session && req.session.userId) {
      userId = req.session.userId;
    }

    if (userId) {
      const user = await getCachedUser(userId);
      if (user && user.isActive) {
        req.user = user;
        res.locals.currentUser = user;
      }
    }
  } catch (e) {
    // Non-fatal if DB not ready
  }

  next();
});

// 5.1 Health Check (Guarantees instant 200 OK for uptime & Vercel verification)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Nirmana service is operational',
    environment: config.nodeEnv,
    isVercel: Boolean(process.env.VERCEL),
    dbDialect: sequelize && typeof sequelize.getDialect === 'function' ? sequelize.getDialect() : config.db.dialect,
    dbInitialized: isDbInitialized,
    dbError: dbInitError ? dbInitError.message : null,
    timezone: 'Asia/Colombo (+05:30)',
    sriLankaTime: formatSriLankaDateTime(new Date()),
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

        // Ensure new Google Drive columns exist in quick_print_files
        try {
          const qi = sequelize.getQueryInterface();
          const tableDesc = await qi.describeTable('quick_print_files').catch(() => null);
          if (tableDesc) {
            if (!tableDesc.driveFileId) {
              await qi.addColumn('quick_print_files', 'driveFileId', {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
              });
            }
            if (!tableDesc.driveViewLink) {
              await qi.addColumn('quick_print_files', 'driveViewLink', {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
              });
            }
            if (!tableDesc.driveDownloadLink) {
              await qi.addColumn('quick_print_files', 'driveDownloadLink', {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
              });
            }
            if (!tableDesc.storageProvider) {
              await qi.addColumn('quick_print_files', 'storageProvider', {
                type: sequelize.Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'LOCAL',
              });
            }
            if (!tableDesc.paperSize) {
              await qi.addColumn('quick_print_files', 'paperSize', {
                type: sequelize.Sequelize.STRING(50),
                allowNull: true,
                defaultValue: 'A4',
              });
            }
            if (!tableDesc.colorMode) {
              await qi.addColumn('quick_print_files', 'colorMode', {
                type: sequelize.Sequelize.STRING(20),
                allowNull: true,
                defaultValue: 'BW',
              });
            }
            if (!tableDesc.copies) {
              await qi.addColumn('quick_print_files', 'copies', {
                type: sequelize.Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 1,
              });
            }
          }

          // Ensure quick_print_jobs table supports MIXED colorMode and longer paperSize
          const jobsDesc = await qi.describeTable('quick_print_jobs').catch(() => null);
          if (jobsDesc) {
            try {
              if (jobsDesc.colorMode && jobsDesc.colorMode.type && jobsDesc.colorMode.type.includes('ENUM')) {
                await sequelize.query("ALTER TABLE `quick_print_jobs` MODIFY COLUMN `colorMode` VARCHAR(20) NOT NULL DEFAULT 'NOT_SPECIFIED'").catch(() => {});
              }
              if (jobsDesc.paperSize) {
                await sequelize.query("ALTER TABLE `quick_print_jobs` MODIFY COLUMN `paperSize` VARCHAR(100) NOT NULL DEFAULT 'A4'").catch(() => {});
              }
            } catch (jobColErr) {
              // Ignore if already adjusted
            }
          }
        } catch (migErr) {
          // Non-fatal if table already updated
        }

        // Clean up previously auto-created Quick Print customers that have no formal orders
        try {
          const { Customer, QuickPrintJob, Order } = require('./src/models');
          const autoCreatedCustomers = await Customer.findAll({
            where: { notes: 'Created automatically via Counter QR Quick Print' },
          });
          for (const c of autoCreatedCustomers) {
            const orderCount = await Order.count({ where: { customerId: c.id } });
            if (orderCount === 0) {
              await QuickPrintJob.update({ customerId: null }, { where: { customerId: c.id } });
              await c.destroy();
            }
          }
        } catch (cleanErr) {
          // Non-fatal
        }

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
  // Allow customer upload form to render independently of database status
  if (req.path === '/upload' || req.path === '/quick-print/upload') {
    return next();
  }

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
