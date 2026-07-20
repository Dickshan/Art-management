require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });

  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '001_init.sql'), 'utf8');
  console.log('Running migration: 001_init.sql');
  await client.query(sql);
  console.log('Migration complete.');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
