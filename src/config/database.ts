import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbName = (process.env.DB_NAME || 'payroll_db').trim();
if (!dbName) {
  throw new Error('Database name (DB_NAME) must be set and cannot be empty');
}

const config: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5939'),
  database: dbName,
  user: process.env.DB_USER || 'payroll_user',
  password: process.env.DB_PASSWORD || 'payroll_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const pool = new Pool(config);

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Database query error', error);
    throw error;
  }
};
