import { PGlite } from '@electric-sql/pglite';

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  github_id: string | null;
  plan: 'free' | 'premium';
  created_at: Date;
  updated_at: Date;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'premium';
  status: 'active' | 'cancelled' | 'expired';
  current_period_start: Date | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Job {
  id: string;
  user_id: string | null;
  input_file_id: string;
  input_filename: string;
  output_format: string;
  output_file_id: string | null;
  output_filename: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  progress: number;
  file_size: number;
  watermark: boolean;
  priority: 'standard' | 'priority';
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface DailyConversionCount {
  user_id: string;
  date: string;
  count: number;
}

export interface FileUpload {
  id: string;
  user_id: string | null;
  original_filename: string;
  stored_filename: string;
  file_size: number;
  mime_type: string;
  status: 'uploaded' | 'processed' | 'deleted';
  created_at: Date;
  expires_at: Date;
}

export const createTables = async (pool: PGlite) => {
  await pool.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      serial_no SERIAL,
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      google_id VARCHAR(255) UNIQUE,
      github_id VARCHAR(255) UNIQUE,
      plan VARCHAR(50) NOT NULL DEFAULT 'free',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Subscriptions table
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(255) UNIQUE,
      stripe_subscription_id VARCHAR(255) UNIQUE,
      plan VARCHAR(50) NOT NULL DEFAULT 'free',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      current_period_start TIMESTAMP WITH TIME ZONE,
      current_period_end TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- File uploads table
    CREATE TABLE IF NOT EXISTS file_uploads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      original_filename VARCHAR(255) NOT NULL,
      stored_filename VARCHAR(255) NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    -- Jobs table
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      input_file_id UUID NOT NULL REFERENCES file_uploads(id),
      input_filename VARCHAR(255) NOT NULL,
      output_format VARCHAR(50) NOT NULL,
      output_file_id UUID REFERENCES file_uploads(id),
      output_filename VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      file_size BIGINT NOT NULL,
      watermark BOOLEAN NOT NULL DEFAULT false,
      priority VARCHAR(50) NOT NULL DEFAULT 'standard',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE
    );

    -- Daily conversion counts table
    CREATE TABLE IF NOT EXISTS daily_conversion_counts (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON file_uploads(user_id);
    CREATE INDEX IF NOT EXISTS idx_file_uploads_status ON file_uploads(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_daily_conversion_counts_user_id ON daily_conversion_counts(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_conversion_counts_date ON daily_conversion_counts(date);

    -- Updated_at trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Triggers for updated_at
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
    CREATE TRIGGER update_subscriptions_updated_at
      BEFORE UPDATE ON subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
    CREATE TRIGGER update_jobs_updated_at
      BEFORE UPDATE ON jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('Database tables created successfully');
};

export const dropTables = async (pool: PGlite) => {
  await pool.exec(`
    DROP TABLE IF EXISTS daily_conversion_counts CASCADE;
    DROP TABLE IF EXISTS jobs CASCADE;
    DROP TABLE IF EXISTS file_uploads CASCADE;
    DROP TABLE IF EXISTS subscriptions CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
  `);
  console.log('Database tables dropped successfully');
};
