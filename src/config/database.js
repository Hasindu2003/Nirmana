const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let sequelize;

if (config.db.dialect === 'sqlite') {
  const dbDir = path.dirname(path.resolve(config.db.storage));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.db.storage,
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
