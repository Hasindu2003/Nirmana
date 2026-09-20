require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'Nirmana Printing Management System',
  currencySymbol: process.env.CURRENCY_SYMBOL || 'Rs.',
  currencyCode: process.env.CURRENCY_CODE || 'LKR',
  sessionSecret: process.env.SESSION_SECRET || 'nirmana_default_session_secret',
  jwtSecret: process.env.JWT_SECRET || 'nirmana_default_jwt_secret',
  db: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_STORAGE || './data/nirmana.sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'nirmana_printing',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  }
};
