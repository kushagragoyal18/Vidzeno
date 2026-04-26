// Jest manual mock for bullmq — prevents real Redis connections in unit tests.

const mockJob = {
  id: 'mock-job-id',
  data: {},
  progress: 0,
  failedReason: undefined,
  getState: jest.fn().mockResolvedValue('waiting'),
};

const Queue = jest.fn().mockImplementation(() => ({
  add: jest.fn().mockResolvedValue(mockJob),
  getJob: jest.fn().mockResolvedValue(null),
  close: jest.fn().mockResolvedValue(undefined),
  clean: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
}));

const Worker = jest.fn().mockImplementation(() => ({
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
}));

module.exports = { Queue, Worker };
