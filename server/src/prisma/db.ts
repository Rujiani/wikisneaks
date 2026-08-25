import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: true },
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error on pg pool', err);
});

const adapter = new PrismaPg(pool);
export const db = new PrismaClient({ adapter });

export const connectDB = async (): Promise<void> => {
  await db.$queryRaw`SELECT 1`;
  console.info('Database connected');
};

export const closeDB = async (): Promise<void> => {
  await db.$disconnect();
  await pool.end();
};
