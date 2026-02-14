# Sol Calendar - Cloud Sync Setup Guide

This guide walks you through setting up cloud sync and sharing features using Supabase.

## Prerequisites

- A Supabase account (free tier works fine)
- Node.js installed (for local development)

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Wait for database to initialize (~2 minutes)
4. Go to **Settings** → **API**
5. Copy your **Project URL** and **anon public** key

## Step 2: Set Up Database Schema

In your Supabase project:

1. Go to **SQL Editor**
2. Click **New query**
3. Paste the SQL from `docs/database_schema.sql` (see below)
4. Click **Run**

## Step 3: Configure Sol Calendar

### Option A: Using localStorage (for local development)

1. Open Sol Calendar in your browser
2. Navigate to the **Login** tab
3. Paste your Supabase URL and anon key
4. Click **Save & Reload**

### Option B: Using environment variables (for deployment)

Create a `.env` file in the root directory:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Then modify `src/auth.js` to read from environment variables instead of localStorage.

## Database Schema

Save this as `docs/database_schema.sql`:

```sql
-- ============================================================================
-- SOL CALENDAR - DATABASE SCHEMA
-- ============================================================================

-- User Settings (one row per user)
CREATE TABLE user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- User Events (personal events)
CREATE TABLE user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_id TEXT NOT NULL, -- client-generated ID
  event_data JSONB NOT NULL,
  deleted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);

-- Groups
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Group Members
CREATE TABLE group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

-- Group Events (shared events)
CREATE TABLE group_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  event_id TEXT NOT NULL, -- client-generated ID
  event_data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, event_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_events ENABLE ROW LEVEL SECURITY;

-- User Settings Policies
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- User Events Policies
CREATE POLICY "Users can view own events"
  ON user_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON user_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON user_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON user_events FOR DELETE
  USING (auth.uid() = user_id);

-- Groups Policies
CREATE POLICY "Members can view their groups"
  ON groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create groups"
  ON groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update groups"
  ON groups FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete groups"
  ON groups FOR DELETE
  USING (auth.uid() = owner_id);

-- Group Members Policies
CREATE POLICY "Members can view group members"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can join groups"
  ON group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
  ON group_members FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.owner_id = auth.uid()
    )
  );

-- Group Events Policies
CREATE POLICY "Members can view group events"
  ON group_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_events.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create group events"
  ON group_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_events.group_id
      AND group_members.user_id = auth.uid()
    )
    AND auth.uid() = created_by
  );

CREATE POLICY "Members can update group events"
  ON group_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_events.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete group events"
  ON group_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_events.group_id
      AND group_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_user_events_user_id ON user_events(user_id);
CREATE INDEX idx_user_events_updated_at ON user_events(updated_at);
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_group_events_group_id ON group_events(group_id);
CREATE INDEX idx_group_events_updated_at ON group_events(updated_at);
CREATE INDEX idx_groups_invite_code ON groups(invite_code);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_events_updated_at
  BEFORE UPDATE ON user_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_group_events_updated_at
  BEFORE UPDATE ON group_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Step 4: Test Authentication

1. Open Sol Calendar
2. Click **Login** tab
3. Try creating an account with email/password
4. Verify you receive a confirmation email
5. Confirm your account
6. Sign in

## Step 5: Test Sync

1. Create an event while logged in
2. Check Supabase dashboard → **Table Editor** → `user_events`
3. You should see your event synced
4. Open Sol Calendar in another browser/device
5. Sign in with the same account
6. Your events should sync automatically

## Step 6: Test Groups

1. Click **Groups** tab
2. Create a new group
3. Copy the invite code
4. Sign out and create a second account
5. Join the group using the invite code
6. Create an event in the group
7. Sign back in with your first account
8. You should see the shared event

## Troubleshooting

### "Failed to fetch" errors
- Check your Supabase URL and anon key are correct
- Ensure your Supabase project is not paused (free tier pauses after 1 week of inactivity)

### Events not syncing
- Open browser DevTools → Console
- Look for error messages
- Verify RLS policies are set up correctly

### Can't create groups
- Verify you're logged in
- Check group_members table has proper policies
- Ensure invite_code is being generated (check groups.js)

### Database connection issues
- Verify project is active in Supabase dashboard
- Check API keys haven't been rotated
- Try regenerating the anon key

## Production Deployment

For production:

1. **Enable email confirmations** in Supabase → Authentication → Email Templates
2. **Set up custom SMTP** for reliable email delivery
3. **Configure redirect URLs** for magic links
4. **Enable RLS** on all tables (already done in schema)
5. **Set up backups** in Supabase dashboard
6. **Monitor usage** to avoid free tier limits

## Security Best Practices

- Never commit your Supabase keys to git
- Use environment variables for production
- Enable MFA for your Supabase account
- Regularly audit your RLS policies
- Keep the anon key public, keep the service_role key secret
- Monitor authentication logs for suspicious activity

## Offline Support

Sol Calendar works offline by default:

- Events are cached in localStorage
- Changes queue up when offline
- Auto-sync when connection restored
- Last-write-wins conflict resolution

No special configuration needed!

## Need Help?

- Check [Supabase docs](https://supabase.com/docs)
- Review `src/auth.js`, `src/sync.js`, `src/groups.js` for implementation details
- Open an issue on GitHub
