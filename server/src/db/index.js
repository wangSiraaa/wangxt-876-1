const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../data/app.db'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true
  },
  dialectOptions: {
    busy_timeout: 10000
  },
  pool: {
    max: 1,
    min: 0,
    idle: 10000
  }
});

async function initSQLitePragmas() {
  try {
    await sequelize.query('PRAGMA journal_mode = WAL;');
    await sequelize.query('PRAGMA busy_timeout = 10000;');
    await sequelize.query('PRAGMA foreign_keys = ON;');
  } catch (e) {
    console.warn('SQLite PRAGMA init warning:', e.message);
  }
}

module.exports = { sequelize, DataTypes, initSQLitePragmas };
