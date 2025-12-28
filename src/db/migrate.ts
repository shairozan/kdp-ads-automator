#!/usr/bin/env tsx
/**
 * Database migration script
 * Run with: npm run db:migrate
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 */

import { KdpDatabase } from './database.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  console.log('');
  console.log('Example:');
  console.log('  DATABASE_URL=postgresql://user:pass@localhost:5432/kdp_ads npm run db:migrate');
  process.exit(1);
}

console.log('Connecting to PostgreSQL database...');

const db = new KdpDatabase(DATABASE_URL);

async function main() {
  try {
    await db.migrate();
    console.log('Schema created successfully');


    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
