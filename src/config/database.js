const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let sequelize;

const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (dbUrl) {
  sequelize = new Sequelize(dbUrl, {
    dialect: 'mysql',
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

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: config.nodeEnv === 'development' ? false : false, // set to console.log if debugging SQL queries
    define: {
      timestamps: true,
      underscored: false,
    },
  });
} else {
  sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
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
}

module.exports = sequelize;
