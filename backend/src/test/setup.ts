import dotenv from 'dotenv';
import path from 'path';

// Load test-specific environment before any module is imported
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Increase timeout for any integration tests in this suite
jest.setTimeout(30000);

// Suppress noisy connection-refused errors from DB/Redis probes
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('ECONNREFUSED') || msg.includes('connect ETIMEDOUT')) return;
  originalConsoleError(...args);
};
