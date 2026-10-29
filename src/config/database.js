const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Statically referenced so @vercel/nft traces and bundles mysql2, sqlite3 & pg
try {
  require('mysql2');
} catch (e) {}
try {
  require('sqlite3');
} catch (e) {}
try {
  require('pg');
} catch (e) {}
try {
  require('pg-hstore');
} catch (e) {}

let sequelize;
let initError = null;

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL;

if (dbUrl) {
  try {
    let dialect = 'mysql';
    if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://') || process.env.DB_DIALECT === 'postgres') {
      dialect = 'postgres';
    } else if (dbUrl.startsWith('sqlite:') || process.env.DB_DIALECT === 'sqlite') {
      dialect = 'sqlite';
    } else if (dbUrl.startsWith('mysql://') || process.env.DB_DIALECT === 'mysql') {
      dialect = 'mysql';
    }

    let cleanUrl = dbUrl;
    if (dialect === 'mysql') {
      // Strip query parameters like ?ssl={"rejectUnauthorized":true} or ?sslaccept=strict
      // mysql2 treats ?ssl=XYZ as a named profile instead of options and fails
      cleanUrl = cleanUrl.replace(/[?&]ssl=[^&]*/gi, '');
      cleanUrl = cleanUrl.replace(/[?&]sslaccept=[^&]*/gi, '');
      cleanUrl = cleanUrl.replace(/[?&]sslmode=[^&]*/gi, '');
      if (cleanUrl.endsWith('?')) {
        cleanUrl = cleanUrl.slice(0, -1);
      }
      if (!cleanUrl.includes('?') && cleanUrl.includes('&')) {
        cleanUrl = cleanUrl.replace('&', '?');
      }
    }

    const isCloudDb = !cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1');
    const dialectOptions = {};
    if (isCloudDb || process.env.DB_SSL === 'true') {
      dialectOptions.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? true : false,
      };
    }

    const seqOptions = {
      dialect,
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
    };

    if (dialect === 'mysql') {
      seqOptions.timezone = '+05:30';
    }

    sequelize = new Sequelize(cleanUrl, seqOptions);
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
    const dialect = config.db.dialect === 'postgres' ? 'postgres' : 'mysql';
    const isCloud = config.db.host !== 'localhost' && config.db.host !== '127.0.0.1';
    const dialectOptions = {};
    if (isCloud || process.env.DB_SSL === 'true') {
      dialectOptions.ssl = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? true : false,
      };
    }

    const seqOptions = {
      host: config.db.host,
      port: config.db.port || (dialect === 'postgres' ? 5432 : 3306),
      dialect,
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
    };

    if (dialect === 'mysql') {
      seqOptions.timezone = '+05:30';
    }

    sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, seqOptions);
  } catch (driverErr) {
    console.warn(`Warning: ${config.db.dialect} driver failed to load:`, driverErr.message);
    initError = driverErr;
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
