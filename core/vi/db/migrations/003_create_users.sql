-- Migration: Create users table
-- Purpose: Store user accounts for authentication
-- Author: Vi Core Team
-- Date: 2025-12-23

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false
);

-- Index for email lookups (login)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Add user_id to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for user's conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
