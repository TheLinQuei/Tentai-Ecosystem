import { Pool } from 'pg';
import { getLogger } from '../telemetry/logger.js';

interface Migration {
  id: string;
  sql: string;
}

/**
 * CRITICAL: Migrations array must be kept in numeric ID order.
 * 
 * The runMigrations() function sorts by numeric ID prefix (e.g., 0027, 0030)
 * to ensure correct execution order, but array ordering matters for readability.
 * 
 * DO NOT add migrations out of sequence:
 * - Migrations must run in order (0027 before 0030, etc.)
 * - ALTER TABLE must come after CREATE TABLE
 * - Missing columns cause "undefined" errors at runtime
 * - Out-of-order migrations are one careless merge away from breaking prod
 * 
 * When adding new migrations:
 * 1. Determine the next numeric ID (current max + 1)
 * 2. Add it to this array in numeric position
 * 3. Ensure prior migrations exist before ALTERing their tables
 * 4. Run ci:fresh-db-migrate-test to verify on clean install
 */
const migrations: Migration[] = [
  {
    id: '0001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS applied_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    `,
  },
  {
    id: '0002_add_users_and_conversation_ownership',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_verified BOOLEAN NOT NULL DEFAULT false
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

      -- Ensure existing users.id column is UUID with default
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'id' AND data_type <> 'uuid'
        ) THEN
          ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::uuid;
        END IF;
      END $$;

      ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

      -- Ensure existing conversations.user_id column is UUID
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'conversations' AND column_name = 'user_id' AND data_type <> 'uuid'
        ) THEN
          ALTER TABLE conversations ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    `,
  },
  {
    id: '0003_add_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL UNIQUE,
        access_token_jti TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id, expires_at, revoked_at);
    `,
  },
  {
    id: '0004_add_run_records',
    sql: `
      CREATE TABLE IF NOT EXISTS run_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thought_state_id UUID NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
        input_text TEXT NOT NULL,
        intent JSONB NOT NULL,
        plan_executed JSONB NOT NULL,
        execution_result JSONB NOT NULL,
        reflection JSONB NOT NULL,
        assistant_output TEXT,
        total_duration INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_run_records_user_id ON run_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_run_records_session_id ON run_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_run_records_timestamp ON run_records(timestamp DESC);
    `,
  },
  {
    id: '0005_fix_users_uuid_default',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      -- Drop FKs to allow type changes
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'sessions' AND constraint_type = 'FOREIGN KEY'
        ) THEN
          ALTER TABLE sessions DROP CONSTRAINT sessions_user_id_fkey;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'conversations' AND constraint_type = 'FOREIGN KEY'
        ) THEN
          ALTER TABLE conversations DROP CONSTRAINT conversations_user_id_fkey;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'run_records' AND constraint_name = 'run_records_user_id_fkey'
        ) THEN
          ALTER TABLE run_records DROP CONSTRAINT run_records_user_id_fkey;
        END IF;
      END $$;

      -- If users table exists and is empty, recreate with UUID
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
        ) THEN
          IF (SELECT COUNT(*) FROM users) = 0 THEN
            DROP TABLE users;
          END IF;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_verified BOOLEAN NOT NULL DEFAULT false
      );

      -- Ensure conversations.user_id is UUID
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID;
      ALTER TABLE conversations ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
      ALTER TABLE conversations
        ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE;

      -- Ensure sessions.user_id is UUID and FK exists
      -- If sessions table is empty, recreate with correct schema
      DO $$
      BEGIN
        IF (SELECT COUNT(*) FROM sessions) = 0 THEN
          DROP TABLE sessions;
          CREATE TABLE sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token TEXT NOT NULL UNIQUE,
            access_token_jti TEXT,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        ELSE
          ALTER TABLE sessions ALTER COLUMN id TYPE UUID USING id::uuid;
          ALTER TABLE sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
          ALTER TABLE sessions ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
        END IF;
      END $$;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'sessions' AND constraint_name = 'sessions_user_id_fkey'
        ) THEN
          ALTER TABLE sessions
            ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'run_records' AND constraint_name = 'run_records_user_id_fkey'
        ) THEN
          ALTER TABLE run_records
            ADD CONSTRAINT run_records_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `,
  },
  {
    id: '0006_add_pgvector',
    sql: `
      CREATE EXTENSION IF NOT EXISTS vector;
    `,
  },
  {
    id: '0007_add_memory_vectors_table',
    sql: `
      CREATE TABLE IF NOT EXISTS memory_vectors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        type VARCHAR(20) NOT NULL,
        embedding vector(1536) NOT NULL,
        text TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_memory_vectors_user_id ON memory_vectors(user_id);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_session_id ON memory_vectors(session_id);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_type ON memory_vectors(type);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_embedding ON memory_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_memory_vectors_created_at ON memory_vectors(created_at DESC);
    `,
  },
  {
    id: '0008_add_tool_execution_log',
    sql: `
      CREATE TABLE IF NOT EXISTS tool_execution_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        tool_name VARCHAR(255) NOT NULL,
        parameters JSONB NOT NULL,
        result JSONB,
        status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failure', 'timeout', 'permission_denied', 'rate_limited')),
        execution_time_ms INTEGER NOT NULL,
        cost_applied INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_tool_execution_log_user_id ON tool_execution_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_tool_execution_log_tool_name ON tool_execution_log(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_execution_log_status ON tool_execution_log(status);
      CREATE INDEX IF NOT EXISTS idx_tool_execution_log_created_at ON tool_execution_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tool_execution_log_user_created ON tool_execution_log(user_id, created_at DESC);
    `,
  },
  {
    id: '0009_add_user_credits',
    sql: `
      CREATE TABLE IF NOT EXISTS user_credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        credits_balance NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
        credits_spent NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        last_reset TIMESTAMPTZ NOT NULL DEFAULT now(),
        reset_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (reset_cycle IN ('daily', 'weekly', 'monthly', 'none')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_credits_updated_at ON user_credits(updated_at DESC);
    `,
  },
  {
    id: '0009_add_assistant_output_to_run_records',
    sql: `
      -- Add assistant_output column to run_records if it doesn't exist
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'run_records' AND column_name = 'assistant_output'
        ) THEN
          ALTER TABLE run_records ADD COLUMN assistant_output TEXT;
        END IF;
      END $$;
    `,
  },
    {
      id: '0010_add_user_profiles',
      sql: `
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          profile JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at DESC);
      `,
    },
    {
      id: '0011_add_self_models_and_events',
      sql: `
        CREATE TABLE IF NOT EXISTS self_models (
          version TEXT PRIMARY KEY,
          model JSONB NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_self_models_active ON self_models(is_active) WHERE is_active = true;

        CREATE TABLE IF NOT EXISTS self_model_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          version TEXT NOT NULL,
          event_type TEXT NOT NULL,
          details JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_self_model_events_version ON self_model_events(version);
        CREATE INDEX IF NOT EXISTS idx_self_model_events_created ON self_model_events(created_at DESC);
      `,
    },
    {
      id: '0012_add_profile_audit_log',
      sql: `
        CREATE TABLE IF NOT EXISTS profile_audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
          signal_type TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT NOT NULL,
          confidence NUMERIC(3, 2) NOT NULL,
          reason TEXT NOT NULL,
          version INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_profile_audit_user_id ON profile_audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_profile_audit_signal_type ON profile_audit_log(signal_type);
        CREATE INDEX IF NOT EXISTS idx_profile_audit_timestamp ON profile_audit_log(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_profile_audit_user_signal ON profile_audit_log(user_id, signal_type, timestamp DESC);
      `,
    },
    {
      id: '0013_add_user_profile_signals',
      sql: `
        CREATE TABLE IF NOT EXISTS user_profile_signals (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          signal_type TEXT NOT NULL,
          value TEXT NOT NULL,
          weight NUMERIC(4, 3) NOT NULL DEFAULT 0.700,
          confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.700,
          first_observed TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_observed TIMESTAMPTZ NOT NULL DEFAULT now(),
          observation_count INTEGER NOT NULL DEFAULT 1,
          decay_factor NUMERIC(4, 3) NOT NULL DEFAULT 0.950,
          PRIMARY KEY (user_id, signal_type)
        );

        CREATE INDEX IF NOT EXISTS idx_user_profile_signals_user ON user_profile_signals(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_profile_signals_type ON user_profile_signals(signal_type);
      `,
    },
    {
      id: '0014_add_bonds',
      sql: `
        CREATE TABLE IF NOT EXISTS bonds (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          trust NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
          familiarity NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
          rapport NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
          commitments_made INTEGER NOT NULL DEFAULT 0,
          commitments_kept INTEGER NOT NULL DEFAULT 0,
          interaction_count INTEGER NOT NULL DEFAULT 0,
          first_interaction TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_interaction TIMESTAMPTZ NOT NULL DEFAULT now(),
          decay_factor NUMERIC(4, 3) NOT NULL DEFAULT 0.980,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          version INTEGER NOT NULL DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_bonds_last_interaction ON bonds(last_interaction DESC);
        CREATE INDEX IF NOT EXISTS idx_bonds_trust ON bonds(trust DESC);

        CREATE TABLE IF NOT EXISTS bond_audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
          changes TEXT NOT NULL,
          trust NUMERIC(4, 3) NOT NULL,
          familiarity NUMERIC(4, 3) NOT NULL,
          rapport NUMERIC(4, 3) NOT NULL,
          version INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_bond_audit_user_id ON bond_audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_bond_audit_timestamp ON bond_audit_log(timestamp DESC);
      `,
    },
  {
    id: '0015_add_multidimensional_memory',
    sql: `
      -- Episodic Memory: specific conversation events, timestamped
      CREATE TABLE IF NOT EXISTS episodic_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        embedding vector(1536) NOT NULL,
        text TEXT NOT NULL,
        metadata JSONB,
        relevance_score DECIMAL(3, 2) DEFAULT 1.0, -- Decay target (1.0 → 0.0)
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_episodic_memory_user_id ON episodic_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_episodic_memory_session_id ON episodic_memory(session_id);
      CREATE INDEX IF NOT EXISTS idx_episodic_memory_embedding ON episodic_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_episodic_memory_relevance ON episodic_memory(relevance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_episodic_memory_created_at ON episodic_memory(created_at DESC);

      -- Semantic Memory: facts, knowledge, confidence-scored
      CREATE TABLE IF NOT EXISTS semantic_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        embedding vector(1536) NOT NULL,
        text TEXT NOT NULL,
        category VARCHAR(50), -- fact type: preference, skill, context, etc.
        confidence DECIMAL(3, 2) DEFAULT 0.5, -- 0.0 to 1.0
        metadata JSONB,
        relevance_score DECIMAL(3, 2) DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_semantic_memory_user_id ON semantic_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_semantic_memory_embedding ON semantic_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_semantic_memory_category ON semantic_memory(category);
      CREATE INDEX IF NOT EXISTS idx_semantic_memory_confidence ON semantic_memory(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_semantic_memory_relevance ON semantic_memory(relevance_score DESC);

      -- Relational Memory: bond-specific recalls, tied to userId
      CREATE TABLE IF NOT EXISTS relational_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        embedding vector(1536) NOT NULL,
        text TEXT NOT NULL,
        affective_valence DECIMAL(2, 1), -- -1.0 (negative) to 1.0 (positive)
        metadata JSONB,
        relevance_score DECIMAL(3, 2) DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_relational_memory_user_id ON relational_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_relational_memory_session_id ON relational_memory(session_id);
      CREATE INDEX IF NOT EXISTS idx_relational_memory_embedding ON relational_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_relational_memory_valence ON relational_memory(affective_valence DESC);
      CREATE INDEX IF NOT EXISTS idx_relational_memory_relevance ON relational_memory(relevance_score DESC);

      -- Commitment Memory: promises made, deadlines, completion status
      CREATE TABLE IF NOT EXISTS commitment_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        embedding vector(1536) NOT NULL,
        text TEXT NOT NULL,
        commitment_type VARCHAR(50), -- promise, reminder, stance_taken, etc.
        status VARCHAR(20) DEFAULT 'pending', -- pending, fulfilled, broken, expired
        deadline TIMESTAMPTZ,
        fulfilled_at TIMESTAMPTZ,
        metadata JSONB,
        relevance_score DECIMAL(3, 2) DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_commitment_memory_user_id ON commitment_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_commitment_memory_session_id ON commitment_memory(session_id);
      CREATE INDEX IF NOT EXISTS idx_commitment_memory_embedding ON commitment_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_commitment_memory_status ON commitment_memory(status);
      CREATE INDEX IF NOT EXISTS idx_commitment_memory_deadline ON commitment_memory(deadline ASC NULLS LAST);
      CREATE INDEX IF NOT EXISTS idx_commitment_memory_relevance ON commitment_memory(relevance_score DESC);

      -- Audit trail for memory operations
      CREATE TABLE IF NOT EXISTS memory_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        memory_type VARCHAR(20) NOT NULL, -- episodic, semantic, relational, commitment
        memory_id UUID NOT NULL,
        operation VARCHAR(20) NOT NULL, -- create, access, decay, consolidate, delete
        old_relevance DECIMAL(3, 2),
        new_relevance DECIMAL(3, 2),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_memory_audit_log_user_id ON memory_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_memory_audit_log_memory_id ON memory_audit_log(memory_id);
      CREATE INDEX IF NOT EXISTS idx_memory_audit_log_operation ON memory_audit_log(operation);
      CREATE INDEX IF NOT EXISTS idx_memory_audit_log_created_at ON memory_audit_log(created_at DESC);
    `,
  },
  {
    id: '0016_task_queue_and_execution_engine',
    sql: `
      -- Goals: persistent top-level objectives
      CREATE TABLE IF NOT EXISTS goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'in_progress', 'completed', 'failed', 'cancelled')),
        priority INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
      CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(priority DESC);
      CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);

      -- Tasks: atomic work units, steps within goals
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        step_index INT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        state VARCHAR(20) NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'blocked')),
        retries INT NOT NULL DEFAULT 0,
        max_retries INT NOT NULL DEFAULT 3,
        backoff_until TIMESTAMPTZ,
        last_error TEXT,
        verification_status VARCHAR(20) DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'failed')),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
      CREATE INDEX IF NOT EXISTS idx_tasks_backoff_until ON tasks(backoff_until) WHERE backoff_until IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_verification ON tasks(verification_status);
      CREATE INDEX IF NOT EXISTS idx_tasks_goal_state ON tasks(goal_id, state);

      -- Task events: audit trail for task progression
      CREATE TABLE IF NOT EXISTS task_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_events_type ON task_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at DESC);
    `,
  },
  {
    id: '0017_verification_layer',
    sql: `
      -- Verification events: audit trail for verification checks
      CREATE TABLE IF NOT EXISTS verification_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        step_index INT NOT NULL,
        event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('verification_started', 'verification_completed', 'verification_failed', 'verification_timeout', 'verification_skipped')),
        verifier_name VARCHAR(100) NOT NULL,
        expected JSONB,
        result JSONB,
        verification_result JSONB,
        error TEXT,
        duration_ms INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_verification_events_task_id ON verification_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_verification_events_event_type ON verification_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_verification_events_step_index ON verification_events(task_id, step_index);
      CREATE INDEX IF NOT EXISTS idx_verification_events_created_at ON verification_events(created_at DESC);

      -- Verifier registry: track registered verifiers for tools
      CREATE TABLE IF NOT EXISTS verifier_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_name VARCHAR(100),
        verifier_type VARCHAR(100) NOT NULL,
        verifier_name VARCHAR(100) NOT NULL,
        config JSONB,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_verifier_registry_unique
        ON verifier_registry(COALESCE(tool_name, ''), verifier_type, verifier_name);
      CREATE INDEX IF NOT EXISTS idx_verifier_registry_tool_name ON verifier_registry(tool_name) WHERE tool_name IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_verifier_registry_verifier_type ON verifier_registry(verifier_type);
      CREATE INDEX IF NOT EXISTS idx_verifier_registry_enabled ON verifier_registry(is_enabled);
    `,
  },
  {
    id: '0018_evaluation_and_regression',
    sql: `
      -- Golden conversations: reference implementations for evaluation
      CREATE TABLE IF NOT EXISTS golden_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        intent VARCHAR(100) NOT NULL,
        primary_stance VARCHAR(100) NOT NULL,
        secondary_stances JSONB,
        required_memory_recall JSONB,
        required_tool_usage JSONB,
        required_refusal JSONB,
        user_messages JSONB NOT NULL,
        golden_responses JSONB NOT NULL,
        tags JSONB,
        creator VARCHAR(255) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_golden_conversations_intent ON golden_conversations(intent);
      CREATE INDEX IF NOT EXISTS idx_golden_conversations_stance ON golden_conversations(primary_stance);
      CREATE INDEX IF NOT EXISTS idx_golden_conversations_creator ON golden_conversations(creator);
      CREATE INDEX IF NOT EXISTS idx_golden_conversations_created_at ON golden_conversations(created_at DESC);

      -- Conversation evaluations: evaluation results against golden conversations
      CREATE TABLE IF NOT EXISTS conversation_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        golden_conversation_id UUID NOT NULL REFERENCES golden_conversations(id) ON DELETE CASCADE,
        actual_conversation_id VARCHAR(255) NOT NULL,
        overall_score NUMERIC(3, 2) NOT NULL,
        identity_score NUMERIC(3, 2) NOT NULL,
        memory_score NUMERIC(3, 2) NOT NULL,
        tool_score NUMERIC(3, 2) NOT NULL,
        tone_score NUMERIC(3, 2) NOT NULL,
        refusal_score NUMERIC(3, 2) NOT NULL,
        turn_evaluations JSONB NOT NULL,
        stats JSONB NOT NULL,
        regression_status VARCHAR(50) NOT NULL CHECK (regression_status IN ('pass', 'fail', 'degradation', 'improvement')),
        previous_score NUMERIC(3, 2),
        evaluated_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_evaluations_golden_id ON conversation_evaluations(golden_conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_evaluations_actual_id ON conversation_evaluations(actual_conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_evaluations_regression ON conversation_evaluations(regression_status);
      CREATE INDEX IF NOT EXISTS idx_conversation_evaluations_score ON conversation_evaluations(overall_score);
      CREATE INDEX IF NOT EXISTS idx_conversation_evaluations_created_at ON conversation_evaluations(created_at DESC);

      -- Response feedback: user annotations for console tagging
      CREATE TABLE IF NOT EXISTS response_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR(255) NOT NULL,
        message_id VARCHAR(255) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        feedback VARCHAR(50) NOT NULL CHECK (feedback IN ('positive', 'negative', 'neutral')),
        comment TEXT,
        issues JSONB,
        user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_response_feedback_conversation_id ON response_feedback(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_response_feedback_message_id ON response_feedback(message_id);
      CREATE INDEX IF NOT EXISTS idx_response_feedback_user_id ON response_feedback(user_id);
      CREATE INDEX IF NOT EXISTS idx_response_feedback_rating ON response_feedback(rating);
      CREATE INDEX IF NOT EXISTS idx_response_feedback_created_at ON response_feedback(created_at DESC);

      -- Regression test suites: collections of golden conversations for regression testing
      CREATE TABLE IF NOT EXISTS regression_test_suites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(500) NOT NULL,
        description TEXT,
        golden_conversation_ids JSONB NOT NULL,
        passing_score NUMERIC(3, 2) NOT NULL,
        critical_issue_threshold INT,
        evaluate_memory BOOLEAN DEFAULT true,
        evaluate_tools BOOLEAN DEFAULT true,
        evaluate_refusals BOOLEAN DEFAULT true,
        evaluate_tone BOOLEAN DEFAULT true,
        creator VARCHAR(255) NOT NULL,
        tags JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_regression_test_suites_creator ON regression_test_suites(creator);
      CREATE INDEX IF NOT EXISTS idx_regression_test_suites_created_at ON regression_test_suites(created_at DESC);

      -- Regression test runs: results from running a test suite
      CREATE TABLE IF NOT EXISTS regression_test_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suite_id UUID NOT NULL REFERENCES regression_test_suites(id) ON DELETE CASCADE,
        evaluations JSONB NOT NULL,
        stats JSONB NOT NULL,
        issues_summary JSONB NOT NULL,
        approval_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        approved_by VARCHAR(255),
        approval_comment TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_regression_test_runs_suite_id ON regression_test_runs(suite_id);
      CREATE INDEX IF NOT EXISTS idx_regression_test_runs_approval_status ON regression_test_runs(approval_status);
      CREATE INDEX IF NOT EXISTS idx_regression_test_runs_created_at ON regression_test_runs(created_at DESC);
    `,
  },
  {
    id: '0019_create_overseer_audit_log',
    sql: `
      -- Migration: Create overseer_audit_log table
      -- Purpose: Store all Overseer control plane actions for persistent audit trail
      -- Phase: 2 (Operations Hardening)

      CREATE TABLE IF NOT EXISTS overseer_audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        action VARCHAR(100) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        request_body JSONB,
        response_status INTEGER,
        response_body JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        duration_ms INTEGER,
        error TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Index for fast queries by timestamp
      CREATE INDEX IF NOT EXISTS idx_overseer_audit_timestamp ON overseer_audit_log(timestamp DESC);

      -- Index for queries by action
      CREATE INDEX IF NOT EXISTS idx_overseer_audit_action ON overseer_audit_log(action);

      -- Index for queries by user
      CREATE INDEX IF NOT EXISTS idx_overseer_audit_user ON overseer_audit_log(user_id) WHERE user_id IS NOT NULL;

      -- Retention policy: Auto-delete entries older than 90 days
      -- (Run via scheduled job or manually)
      COMMENT ON TABLE overseer_audit_log IS 'Persistent audit trail for Overseer control plane actions. Retention: 90 days.';
    `,
  },
  {
    id: '0020_codex_tables',
    sql: `
      -- Astralis Codex additive tables (v1)
      -- Rule: additive-only; no breaking changes to existing core tables

      CREATE TABLE IF NOT EXISTS codex_eras (
        id UUID PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        summary TEXT,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS codex_entities (
        id UUID PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN (
          'Character','World','Ability','Item','Law','Rule','Event','Era','Organization','Species'
        )),
        aliases JSONB NOT NULL DEFAULT '[]',
        summary TEXT,
        truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
        confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
        era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
        citations JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_entities_slug ON codex_entities(slug);

      CREATE TABLE IF NOT EXISTS codex_facets (
        id UUID PRIMARY KEY,
        entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
        confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_facets_entity ON codex_facets(entity_id);
      CREATE INDEX IF NOT EXISTS idx_codex_facets_entity_key ON codex_facets(entity_id, key);

      CREATE TABLE IF NOT EXISTS codex_states (
        id UUID PRIMARY KEY,
        entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        data JSONB NOT NULL,
        era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
        truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
        confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_states_entity ON codex_states(entity_id);
      CREATE INDEX IF NOT EXISTS idx_codex_states_entity_key ON codex_states(entity_id, key);

      CREATE TABLE IF NOT EXISTS codex_relations (
        id UUID PRIMARY KEY,
        subject_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
        object_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        weight NUMERIC CHECK (weight >= 0 AND weight <= 1),
        era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
        truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
        confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_relations_subject ON codex_relations(subject_id);
      CREATE INDEX IF NOT EXISTS idx_codex_relations_object ON codex_relations(object_id);

      CREATE TABLE IF NOT EXISTS codex_events (
        id UUID PRIMARY KEY,
        type TEXT NOT NULL,
        primary_entity_id UUID NULL REFERENCES codex_entities(id) ON DELETE SET NULL,
        era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        summary TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_events_era ON codex_events(era_id);
      CREATE INDEX IF NOT EXISTS idx_codex_events_primary_entity ON codex_events(primary_entity_id);

      CREATE TABLE IF NOT EXISTS codex_event_entities (
        event_id UUID NOT NULL REFERENCES codex_events(id) ON DELETE CASCADE,
        entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
        PRIMARY KEY (event_id, entity_id)
      );

      CREATE TABLE IF NOT EXISTS codex_changes (
        id UUID PRIMARY KEY,
        change_type TEXT NOT NULL CHECK (change_type IN ('add','update','delete','deprecate')),
        entity_id UUID NULL REFERENCES codex_entities(id) ON DELETE SET NULL,
        proposer_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','proposed','approved','rejected')),
        approvals JSONB NOT NULL DEFAULT '[]',
        applied_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_codex_changes_status ON codex_changes(status);
      CREATE INDEX IF NOT EXISTS idx_codex_changes_entity ON codex_changes(entity_id);
    `,
  },
  {
    id: '0021_add_user_profile_features',
    sql: `
      -- Add feature flags/profile features JSON for canon policies
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;
      UPDATE user_profiles SET features = '{}'::jsonb WHERE features IS NULL;
    `,
  },
  {
    id: '0022_add_response_citations',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS response_citations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_record_id UUID NOT NULL REFERENCES run_records(id) ON DELETE CASCADE,
        citation_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_text TEXT,
        confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
        metadata JSONB,
        source_timestamp TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (run_record_id, citation_type, source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_response_citations_run_record ON response_citations(run_record_id);
      CREATE INDEX IF NOT EXISTS idx_response_citations_type ON response_citations(citation_type);
    `,
  },
  {
    id: '0023_user_identity_map',
    sql: `
      -- Phase 1: User Identity Map
      -- Purpose: Global identity mapping across all clients
      -- Constraint: ONE user → ONE vi_user_id, enforced via UNIQUE(provider, provider_user_id)

      CREATE TABLE IF NOT EXISTS user_identity_map (
        vi_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(provider, provider_user_id)
      );

      -- Index for fast lookup by provider identity
      CREATE INDEX IF NOT EXISTS idx_user_identity_map_provider_id
      ON user_identity_map(provider, provider_user_id);

      -- Index for finding all providers linked to vi_user_id
      CREATE INDEX IF NOT EXISTS idx_user_identity_map_vi_user_id
      ON user_identity_map(vi_user_id);

      -- Trigger to update updated_at
      CREATE OR REPLACE FUNCTION update_user_identity_map_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_user_identity_map_updated_at ON user_identity_map;
      CREATE TRIGGER trigger_user_identity_map_updated_at
      BEFORE UPDATE ON user_identity_map
      FOR EACH ROW
      EXECUTE FUNCTION update_user_identity_map_updated_at();
    `,
  },
  {
    id: '0024_identity_audit_log',
    sql: `
      -- Identity mutation audit log for security and compliance
      CREATE TABLE IF NOT EXISTS identity_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vi_user_id UUID NOT NULL,
        action TEXT NOT NULL, -- 'link' | 'unlink' | 'create' | 'migrate'
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        performed_by TEXT, -- user_id or 'system'
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_identity_audit_log_user ON identity_audit_log(vi_user_id);
      CREATE INDEX IF NOT EXISTS idx_identity_audit_log_action ON identity_audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_identity_audit_log_created_at ON identity_audit_log(created_at DESC);
    `,
  },
  {
    id: '0025_mission_memory',
    sql: `
      -- C5: Mission Memory table for tracking multi-step task execution
      -- Purpose: Track mission state across sessions (resume from checkpoint)
      -- Phase: Critical Path (C5)

      CREATE TABLE IF NOT EXISTS mission_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID,
        mission_id UUID NOT NULL,
        task TEXT NOT NULL,
        steps JSONB NOT NULL DEFAULT '[]',
        current_step INT NOT NULL DEFAULT 0,
        completed_steps JSONB NOT NULL DEFAULT '[]',
        failed_steps JSONB NOT NULL DEFAULT '[]',
        verification_log JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'paused', 'cancelled')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_mission_memory_user_id ON mission_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_mission_memory_session_id ON mission_memory(session_id) WHERE session_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_mission_memory_mission_id ON mission_memory(mission_id);
      CREATE INDEX IF NOT EXISTS idx_mission_memory_status ON mission_memory(status);
      CREATE INDEX IF NOT EXISTS idx_mission_memory_user_status ON mission_memory(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_mission_memory_updated_at ON mission_memory(updated_at DESC);
    `,
  },
  {
    id: '0026_fix_user_identity_map_pk',
    sql: `
      -- Ensure user_identity_map supports multiple providers per vi_user_id
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      -- Add synthetic primary key if missing
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_identity_map' AND column_name = 'id'
        ) THEN
          ALTER TABLE user_identity_map ADD COLUMN id UUID DEFAULT gen_random_uuid();
        END IF;
      END $$;

      -- Drop primary key on vi_user_id if present
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_identity_map'
            AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE user_identity_map DROP CONSTRAINT user_identity_map_pkey;
        END IF;
      END $$;

      -- Recreate primary key on synthetic id
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_identity_map'
            AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE user_identity_map ADD PRIMARY KEY (id);
        END IF;
      END $$;

      -- Ensure uniqueness on provider + provider_user_id
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identity_provider_user ON user_identity_map(provider, provider_user_id);

      -- Ensure vi_user_id is indexed for lookups
      CREATE INDEX IF NOT EXISTS idx_user_identity_vi_user_id ON user_identity_map(vi_user_id);
    `,
  },
  {
    id: '0027_preferences_and_profiles',
    sql: `
      -- Add missing user preference tracking table
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tone_preference VARCHAR(50),
        interaction_mode VARCHAR(50),
        response_preference VARCHAR(50),
        relationship_cue VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

      -- Add preference audit log
      CREATE TABLE IF NOT EXISTS preference_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
        preference_type VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT NOT NULL,
        reason TEXT,
        version INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_preference_audit_user_id ON preference_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_preference_audit_timestamp ON preference_audit_log(timestamp DESC);

      -- Update user_profiles with missing columns
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vi_user_id UUID;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS relationship_type VARCHAR(50) DEFAULT 'normal';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trust_level NUMERIC(4,3) DEFAULT 0.5;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS interaction_mode VARCHAR(50);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tone_preference VARCHAR(50);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS voice_profile VARCHAR(50);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS boundaries_profile VARCHAR(50);
      
      CREATE INDEX IF NOT EXISTS idx_user_profiles_vi_user_id ON user_profiles(vi_user_id) WHERE vi_user_id IS NOT NULL;
    `,
  },
  {
    id: '0028_multidimensional_memory',
    sql: `
      -- Alias for multidimensional memory consolidation (maps to episodic memory primary layer)
      CREATE TABLE IF NOT EXISTS multi_dimensional_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vi_user_id UUID NOT NULL,
        session_id UUID,
        content TEXT NOT NULL,
        memory_type VARCHAR(50) DEFAULT 'episodic',
        relevance_score DECIMAL(3,2) DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_multi_dimensional_memory_vi_user_id ON multi_dimensional_memory(vi_user_id);
      CREATE INDEX IF NOT EXISTS idx_multi_dimensional_memory_session_id ON multi_dimensional_memory(session_id) WHERE session_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_multi_dimensional_memory_memory_type ON multi_dimensional_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_multi_dimensional_memory_created_at ON multi_dimensional_memory(created_at DESC);
    `,
  },
  {
    id: '0029_backfill_identity_and_profiles',
    sql: `
      -- Ensure user_profiles exists with all expected columns
      -- Ensure profile column always has a safe default
      ALTER TABLE user_profiles ALTER COLUMN profile SET DEFAULT '{}'::jsonb;
      UPDATE user_profiles SET profile = '{}'::jsonb WHERE profile IS NULL;

      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location VARCHAR(100);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'free';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tier_features JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS communication_style VARCHAR(100);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS topics_of_interest JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS boundaries JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_metadata JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at DESC);

      -- Align preference tables with vi_user_id usage
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS vi_user_id UUID;
      UPDATE user_preferences SET vi_user_id = COALESCE(vi_user_id, user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_vi_user_id ON user_preferences(vi_user_id) WHERE vi_user_id IS NOT NULL;

      -- Align preference columns with repository expectations
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS tone_correction_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS interaction_mode_locked BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS relationship_cue_owner BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS relationship_cue_trusted BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS relationship_cue_restricted BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS prefer_concise BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS prefer_detailed BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS no_apologies BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS no_disclaimers BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS default_lore_mode BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS last_applied_session_id UUID;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS correction_history JSONB NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS vi_user_id UUID;
      UPDATE preference_audit_log SET vi_user_id = COALESCE(vi_user_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_preference_audit_vi_user_id ON preference_audit_log(vi_user_id) WHERE vi_user_id IS NOT NULL;
      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS change_type TEXT;
      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS old_value JSONB;
      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS new_value JSONB;
      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS reason TEXT;
      ALTER TABLE preference_audit_log ADD COLUMN IF NOT EXISTS session_id UUID;

      -- Add missing layer column for multi_dimensional_memory and backfill from memory_type
      ALTER TABLE multi_dimensional_memory ADD COLUMN IF NOT EXISTS layer VARCHAR(50);
      UPDATE multi_dimensional_memory
      SET layer = COALESCE(layer, memory_type, 'episodic');
      ALTER TABLE multi_dimensional_memory ALTER COLUMN layer SET DEFAULT 'episodic';
      ALTER TABLE multi_dimensional_memory ALTER COLUMN layer SET NOT NULL;

      -- Ensure user_identity_map exists with synthetic primary key and uniqueness
      CREATE TABLE IF NOT EXISTS user_identity_map (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vi_user_id UUID NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identity_provider_user ON user_identity_map(provider, provider_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_identity_vi_user_id ON user_identity_map(vi_user_id);

      -- Trigger to update updated_at on user_identity_map
      CREATE OR REPLACE FUNCTION update_user_identity_map_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_user_identity_map_updated_at ON user_identity_map;
      CREATE TRIGGER trigger_user_identity_map_updated_at
      BEFORE UPDATE ON user_identity_map
      FOR EACH ROW
      EXECUTE FUNCTION update_user_identity_map_updated_at();
    `,
  },
  {
    id: '0030_fix_preference_conflicts',
    sql: `
      -- Ensure preference tables align with upsert expectations
      ALTER TABLE user_preferences ALTER COLUMN vi_user_id SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_vi_user_id_unique ON user_preferences(vi_user_id);

      -- Harden user_profiles defaults
      ALTER TABLE user_profiles ALTER COLUMN profile SET DEFAULT '{}'::jsonb;
      UPDATE user_profiles SET profile = '{}'::jsonb WHERE profile IS NULL;
    `,
  },
  {
    id: '0031_backfill_preference_type',
    sql: `
      -- Backfill preference_type to satisfy legacy NOT NULL constraint
      ALTER TABLE preference_audit_log ALTER COLUMN preference_type DROP NOT NULL;
      UPDATE preference_audit_log SET preference_type = COALESCE(preference_type, change_type, 'preference');
      ALTER TABLE preference_audit_log ALTER COLUMN preference_type SET DEFAULT 'preference';
      ALTER TABLE preference_audit_log ALTER COLUMN version SET DEFAULT 1;
      UPDATE preference_audit_log SET version = 1 WHERE version IS NULL;
    `,
  },
  {
    id: '0032_backfill_audit_version',
    sql: `
      ALTER TABLE preference_audit_log ALTER COLUMN version DROP NOT NULL;
      UPDATE preference_audit_log SET version = COALESCE(version, 1);
      ALTER TABLE preference_audit_log ALTER COLUMN version SET NOT NULL;
      ALTER TABLE preference_audit_log ALTER COLUMN version SET DEFAULT 1;
    `,
  },
  {
    id: '0033_cleanup_orphaned_identity_mappings',
    sql: `
      -- DEV/TEST ONLY: Remove orphaned identity mappings that reference deleted users.
      -- Production cleanup must be explicit and audited via separate admin tooling.
      DELETE FROM user_identity_map
      WHERE vi_user_id NOT IN (SELECT id FROM users);
    `,
  },
  {
    id: '0034_reapply_corrected_migrations_dev_only',
    sql: `
      -- DEV/TEST ONLY: Clear applied_migrations marker for corrected migrations (0027-0030).
      -- This allows fresh dev/test databases to apply migrations in corrected numeric order.
      -- NEVER run this in production: migrations are immutable once applied.
      -- If production needs repair, create new repair migrations instead.
      DELETE FROM applied_migrations 
      WHERE id IN (
        '0027_preferences_and_profiles', 
        '0028_multidimensional_memory', 
        '0029_backfill_identity_and_profiles', 
        '0030_fix_preference_conflicts'
      );
    `,
  },
  {
    id: '0035_create_user_facts',
    sql: `
      CREATE TABLE IF NOT EXISTS user_facts (
        fact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vi_user_id UUID NOT NULL,
        fact_key TEXT NOT NULL,
        fact_type TEXT NOT NULL,         -- rule | preference | context | history
        authority TEXT NOT NULL,         -- locked | explicit | inferred | ephemeral
        scope TEXT NOT NULL,             -- global | project | session
        value JSONB NOT NULL,
        confidence FLOAT DEFAULT 1.0,
        source TEXT NOT NULL,            -- user | system | correction
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        expires_at TIMESTAMPTZ,
        UNIQUE (vi_user_id, fact_key, scope)
      );

      CREATE INDEX IF NOT EXISTS idx_user_facts_user_id ON user_facts(vi_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_facts_authority ON user_facts(authority);
      CREATE INDEX IF NOT EXISTS idx_user_facts_scope ON user_facts(scope);
      CREATE INDEX IF NOT EXISTS idx_user_facts_updated_at ON user_facts(updated_at);
    `,
  },
  {
    id: '0036_create_user_relationships',
    sql: `
      -- Create ENUM types for relationship attributes
      DO $$ BEGIN
        CREATE TYPE relationship_type AS ENUM ('owner', 'public');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE tone_preference AS ENUM ('neutral', 'direct', 'warm', 'formal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE voice_profile AS ENUM ('public_elegant', 'owner_luxury');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE interaction_mode AS ENUM ('default', 'guarded');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      -- Create user_relationships table (one row per vi_user_id)
      -- Note: vi_user_id can appear in user_identity_map multiple times (different providers)
      -- but each vi_user_id has only ONE relationship context
      CREATE TABLE IF NOT EXISTS user_relationships (
        vi_user_id UUID PRIMARY KEY,
        relationship_type relationship_type NOT NULL DEFAULT 'public',
        trust_level SMALLINT NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 100),
        tone_preference tone_preference NOT NULL DEFAULT 'neutral',
        voice_profile voice_profile NOT NULL DEFAULT 'public_elegant',
        interaction_mode interaction_mode NOT NULL DEFAULT 'default',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_user_relationships_vi_user_id ON user_relationships(vi_user_id);

      -- Trigger to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_user_relationships_updated_at()
      RETURNS TRIGGER AS $trigger$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $trigger$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS user_relationships_updated_at ON user_relationships;
      CREATE TRIGGER user_relationships_updated_at
        BEFORE UPDATE ON user_relationships
        FOR EACH ROW
        EXECUTE FUNCTION update_user_relationships_updated_at();
    `,
  },
  {
    id: '0037_fix_identity_map_primary_key',
    sql: `
      -- Fix user_identity_map primary key to allow multiple providers per vi_user_id
      -- Issue: Current PRIMARY KEY(vi_user_id) prevents multiple provider mappings per user
      -- Solution: Change to PRIMARY KEY(provider, provider_user_id), add index on vi_user_id

      -- Step 1: Create new table with correct schema
      CREATE TABLE user_identity_map_new (
        vi_user_id UUID NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, provider_user_id)
      );

      -- Step 2: Copy existing data
      INSERT INTO user_identity_map_new (vi_user_id, provider, provider_user_id, metadata, created_at, updated_at)
      SELECT vi_user_id, provider, provider_user_id, metadata, created_at, updated_at
      FROM user_identity_map;

      -- Step 3: Drop foreign key constraints from dependent tables
      ALTER TABLE user_relationships DROP CONSTRAINT IF EXISTS user_relationships_vi_user_id_fkey;
      
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_facts') THEN
          ALTER TABLE user_facts DROP CONSTRAINT IF EXISTS user_facts_vi_user_id_fkey;
        END IF;
      END $$;

      -- Step 4: Drop old table
      DROP TABLE user_identity_map CASCADE;

      -- Step 5: Rename new table
      ALTER TABLE user_identity_map_new RENAME TO user_identity_map;

      -- Step 6: Create indexes for fast lookups
      CREATE INDEX idx_user_identity_map_vi_user_id ON user_identity_map(vi_user_id);
      CREATE INDEX idx_user_identity_map_provider_id ON user_identity_map(provider, provider_user_id);

      -- Step 7: Recreate trigger for updated_at
      CREATE OR REPLACE FUNCTION update_user_identity_map_updated_at()
      RETURNS TRIGGER AS $trigger$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $trigger$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_user_identity_map_updated_at ON user_identity_map;
      CREATE TRIGGER trigger_user_identity_map_updated_at
      BEFORE UPDATE ON user_identity_map
      FOR EACH ROW
      EXECUTE FUNCTION update_user_identity_map_updated_at();

      -- Step 8: Recreate audit log table if it doesn't exist
      CREATE TABLE IF NOT EXISTS identity_audit_log (
        id SERIAL PRIMARY KEY,
        vi_user_id UUID NOT NULL,
        action TEXT NOT NULL, -- 'link', 'unlink', 'migrate'
        provider TEXT NOT NULL,
        provider_user_id TEXT,
        metadata JSONB DEFAULT '{}',
        performed_by TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_identity_audit_log_vi_user_id ON identity_audit_log(vi_user_id);
      CREATE INDEX IF NOT EXISTS idx_identity_audit_log_created_at ON identity_audit_log(created_at);
    `,
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const logger = getLogger();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = await pool.query<{ id: string }>(
    'SELECT id FROM applied_migrations'
  );
  const appliedIds = new Set(applied.rows.map((row) => row.id));

  // Safety net: recreate critical identity tables if they were dropped in a dirty dev DB
  const identityTable = await pool.query<{ reg: string | null }>("SELECT to_regclass('public.user_identity_map') AS reg");
  if (!identityTable.rows[0]?.reg) {
    logger.warn('user_identity_map table missing; recreating safeguards');
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS user_identity_map (
        vi_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(provider, provider_user_id)
      );

      -- Phase 0026: ensure synthetic primary key and supporting indexes
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_identity_map' AND column_name = 'id'
        ) THEN
          ALTER TABLE user_identity_map ADD COLUMN id UUID DEFAULT gen_random_uuid();
        END IF;
      END $$;

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_identity_map'
            AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE user_identity_map DROP CONSTRAINT user_identity_map_pkey;
        END IF;
      END $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_identity_map'
            AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE user_identity_map ADD PRIMARY KEY (id);
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identity_provider_user ON user_identity_map(provider, provider_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_identity_vi_user_id ON user_identity_map(vi_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_identity_map_provider_id ON user_identity_map(provider, provider_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_identity_map_vi_user_id ON user_identity_map(vi_user_id);

      CREATE OR REPLACE FUNCTION update_user_identity_map_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_user_identity_map_updated_at ON user_identity_map;
      CREATE TRIGGER trigger_user_identity_map_updated_at
      BEFORE UPDATE ON user_identity_map
      FOR EACH ROW
      EXECUTE FUNCTION update_user_identity_map_updated_at();
    `);
  }

  // Sort migrations by numeric ID prefix (e.g., 0027, 0030) to ensure
  // correct execution order regardless of array ordering.
  // This prevents ALTER-before-CREATE and missing column errors.
  const sortedMigrations = [...migrations].sort((a, b) => {
    const aNum = parseInt(a.id.split('_')[0], 10) || 0;
    const bNum = parseInt(b.id.split('_')[0], 10) || 0;
    return aNum - bNum;
  });

  for (const migration of sortedMigrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO applied_migrations (id, applied_at) VALUES ($1, now())',
        [migration.id]
      );
      await client.query('COMMIT');
      logger.info({ id: migration.id }, 'Applied migration');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, id: migration.id }, 'Migration failed');
      throw error;
    } finally {
      client.release();
    }
  }
}
