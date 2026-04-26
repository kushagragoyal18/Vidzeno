// Automatic Jest manual mock for ioredis.
// All tests that import ioredis will get this stub instead of a real connection.

const Redis = jest.fn().mockImplementation(() => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  status: 'ready',
}));

module.exports = Redis;
module.exports.default = Redis;
