const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.POSTGRES_DB,
  process.env.POSTGRES_USER,
  process.env.POSTGRES_PASSWORD,
  {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  }
);

async function connectPostgres() {
  await sequelize.authenticate();
  console.log('[postgres] connected');
  return sequelize;
}

module.exports = { sequelize, connectPostgres };
