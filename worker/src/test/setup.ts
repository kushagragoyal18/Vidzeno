import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Worker tests use mocked child_process — no real ffmpeg needed
jest.setTimeout(15000);
