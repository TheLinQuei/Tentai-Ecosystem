import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

describe('Database Configuration', () => {
  it('should construct database URL from components when DATABASE_URL not set', () => {
    delete process.env.DATABASE_URL;
    process.env.VI_DB_HOST = 'testhost';
    process.env.VI_DB_PORT = '5433';
    process.env.VI_DB_USER = 'testuser';
    process.env.VI_DB_PASSWORD = 'testpass';
    process.env.VI_DB_NAME = 'testdb';

    const config = loadConfig();

    expect(config.database.url).toBe(
      'postgres://testuser:testpass@testhost:5433/testdb'
    );

    // Cleanup
    delete process.env.VI_DB_HOST;
    delete process.env.VI_DB_PORT;
    delete process.env.VI_DB_USER;
    delete process.env.VI_DB_PASSWORD;
    delete process.env.VI_DB_NAME;
  });

  it('should use DATABASE_URL when provided', () => {
    const testUrl = 'postgres://custom:pass@host:1234/db';
    process.env.DATABASE_URL = testUrl;

    const config = loadConfig();

    expect(config.database.url).toBe(testUrl);

    delete process.env.DATABASE_URL;
  });

  it('should encode special characters in password', () => {
    delete process.env.DATABASE_URL;
    process.env.VI_DB_PASSWORD = 'p@ss:word!';

    const config = loadConfig();

    expect(config.database.url).toContain('p%40ss%3Aword!');

    delete process.env.VI_DB_PASSWORD;
  });
});
