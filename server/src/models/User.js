const { sequelize, DataTypes } = require('../db');

const ROLES = {
  TENANT: 'TENANT',
  HOUSEKEEPER: 'HOUSEKEEPER',
  FINANCE: 'FINANCE',
  LEGAL: 'LEGAL',
  SIGN_ADMIN: 'SIGN_ADMIN'
};

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  realName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM(...Object.values(ROLES)),
    allowNull: false
  },
  phone: DataTypes.STRING,
  email: DataTypes.STRING
});

module.exports = { User, ROLES };
