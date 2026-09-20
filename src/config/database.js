const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Statically referenced so @vercel/nft traces and bundles mysql2 & sqlite3
try {
  require('mysql2');
} catch (e) {}
try {
  require('sqlite3');
} catch (e) {}

let sequelize;
let initError = null;

const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (dbUrl) {
  try {
    const isCloudDb = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1');
    const dialectOptions = {};
    if (isCloudDb || process.env.DB_SSL === 'true') {
      dialectOptions.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true,
      };
    }

    sequelize = new Sequelize(dbUrl, {
      dialect: 'mysql',
      dialectOptions,
      logging: config.nodeEnv === 'development' ? false : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        timestamps: true,
        underscored: false,
      },
    });
  } catch (err) {
    console.warn('Warning: Could not initialize cloud database connection:', err.message);
    initError = err;
  }
} else if (config.db.dialect === 'sqlite') {
  const isVercel = Boolean(process.env.VERCEL);
  const storagePath = isVercel
    ? path.join('/tmp', 'nirmana.sqlite')
    : config.db.storage;

  const dbDir = path.dirname(path.resolve(storagePath));
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (err) {
    console.warn('Warning: Could not create database directory:', err.message);
  }

  try {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: storagePath,
      logging: config.nodeEnv === 'development' ? false : false,
      define: {
        timestamps: true,
        underscored: false,
      },
    });
  } catch (sqliteErr) {
    console.warn('Notice: SQLite driver failed to load (expected on Vercel serverless):', sqliteErr.message);
    initError = sqliteErr;
  }
} else {
  try {
    const isCloud = config.db.host !== 'localhost' && config.db.host !== '127.0.0.1';
    const dialectOptions = {};
    if (isCloud || process.env.DB_SSL === 'true') {
      dialectOptions.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true,
      };
    }

    sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
      host: config.db.host,
      port: config.db.port,
      dialect: 'mysql',
      dialectOptions,
      logging: config.nodeEnv === 'development' ? false : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        timestamps: true,
        underscored: false,
      },
    });
  } catch (mysqlErr) {
    console.warn('Warning: MySQL driver failed to load:', mysqlErr.message);
    initError = mysqlErr;
  }
}

// Fallback: If dialect failed to load, create a safe fallback object so models define cleanly without crashing the process
if (!sequelize) {
  try {
    sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
      host: config.db.host,
      port: config.db.port,
      dialect: 'mysql',
      logging: false,
      define: {
        timestamps: true,
        underscored: false,
      },
    });
  } catch (mysqlFallbackErr) {
    // Ultimate mock fallback: allows all models and associations to define without crashing
    sequelize = {
      define: (modelName, attributes, options) => {
        const mockModel = function() {};
        mockModel.init = () => mockModel;
        mockModel.sync = async () => {};
        mockModel.count = async () => 0;
        mockModel.findAll = async () => [];
        mockModel.findOne = async () => null;
        mockModel.findByPk = async () => null;
        mockModel.create = async () => {
          throw new Error('Database is not connected. Please configure DATABASE_URL in Vercel Environment Variables.');
        };
        mockModel.update = async () => [0];
        mockModel.destroy = async () => 0;
        mockModel.hasMany = () => {};
        mockModel.belongsTo = () => {};
        mockModel.hasOne = () => {};
        return mockModel;
      },
      authenticate: async () => {
        throw new Error(initError ? initError.message : 'Database driver is unavailable in this serverless environment');
      },
      sync: async () => {},
      query: async () => [],
    };
  }
}

if (initError) {
  sequelize.__initError = initError;
}

module.exports = sequelize;
