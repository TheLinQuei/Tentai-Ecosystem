# PHASE 3: OPERATOR IDENTITY BINDING & VI PRESENCE LAYER

## Vision

Transform the console from showing system state to showing **operator-Vi relationship state**. 

Replace:
- Generic "User: [UUID]" with "Operator: [Name]"
- Passive online status with active Vi presence (stance, mood, operator recognition)
- Silent control with voice-flavored interactions

---

## 1. Voice Profile Capture (First Login Flow)

### User Story
After first successful login, user sees a brief "operator provisioning" screen where they define their operator identity.

### Screen: Operator Profile Setup

```
┌─────────────────────────────────────────────┐
│  TENTAI // GOD CONSOLE                      │
│  Complete Operator Provisioning             │
└─────────────────────────────────────────────┘

How should Vi address you?
[_______________________]  ← Display Name

Your communication style preference:
  ○ Direct (terse, efficient)
  ○ Balanced (professional, conversational)
  ○ Soft (warm, supportive)

This establishes your operator identity for this session.

[Save Profile]
```

### Data Model

**users table enhancement:**
```sql
ALTER TABLE users ADD COLUMN voice_profile JSON;

-- voice_profile structure:
{
  "displayName": "Shykem",
  "tone": "balanced",  -- "direct" | "balanced" | "soft"
  "relationship": "creator",  -- "creator" | "ally" | "guardian" | "unknown"
  "trustLevel": 0.85,
  "recognitionTime": "2024-01-15T10:30:00Z",
  "preferences": {
    "abbreviate": false,
    "showMeta": true,
    "timeFormat": "iso"
  }
}
```

### Implementation: Server Side

**POST /api/profile/voice-setup**
```typescript
app.post('/api/profile/voice-setup', requireAuth, async (req, res) => {
  const { displayName, tone } = req.body;
  const userId = req.user.userId;
  
  // Validate
  if (!displayName || !['direct', 'balanced', 'soft'].includes(tone)) {
    return res.status(400).json({ error: 'Invalid profile data' });
  }
  
  // Check if already has profile (not first-time)
  const user = await db.query(
    'SELECT voice_profile FROM users WHERE id = $1',
    [userId]
  );
  
  const profile = user.rows[0]?.voice_profile || {};
  const isFirstTime = !profile.displayName;
  
  // Update profile
  const updated = {
    ...profile,
    displayName,
    tone,
    relationship: isFirstTime ? 'creator' : profile.relationship,
    trustLevel: isFirstTime ? 1.0 : profile.trustLevel,
    recognitionTime: new Date().toISOString(),
  };
  
  await db.query(
    'UPDATE users SET voice_profile = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(updated), userId]
  );
  
  res.json({ 
    success: true, 
    profile: updated,
    isFirstTime 
  });
});
```

### Implementation: Client Side

**In index.html, after successful login:**

```javascript
async function checkFirstTimeUser(user) {
  // After boot transition completes
  const profile = user.voice_profile;
  
  if (!profile?.displayName) {
    // Show voice profile setup
    showVoiceProfileSetup();
    return false;
  }
  
  return true;
}

async function showVoiceProfileSetup() {
  const modal = document.createElement('div');
  modal.className = 'voice-profile-modal';
  modal.innerHTML = `
    <div class="voice-profile-card">
      <h2>Complete Operator Provisioning</h2>
      
      <div class="form-group">
        <label for="displayName">How should Vi address you?</label>
        <input 
          type="text" 
          id="displayName"
          placeholder="Your preferred name"
          value="${authState.currentUser?.username || ''}"
        />
      </div>
      
      <div class="form-group">
        <label>Your communication style preference:</label>
        <div class="radio-group">
          <label>
            <input type="radio" name="tone" value="direct" />
            Direct (terse, efficient)
          </label>
          <label>
            <input type="radio" name="tone" value="balanced" checked />
            Balanced (professional, conversational)
          </label>
          <label>
            <input type="radio" name="tone" value="soft" />
            Soft (warm, supportive)
          </label>
        </div>
      </div>
      
      <p class="helper-text">
        This establishes your operator identity for this session.
      </p>
      
      <button class="btn gold" id="saveVoiceProfile">
        Save Profile
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('saveVoiceProfile').addEventListener('click', 
    async () => {
      const displayName = document.getElementById('displayName').value;
      const tone = document.querySelector('input[name="tone"]:checked').value;
      
      const res = await authenticatedFetch('/api/profile/voice-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, tone })
      });
      
      if (res.ok) {
        const data = await res.json();
        authState.currentUser.voice_profile = data.profile;
        modal.remove();
        showConsole();  // Now show full console
      }
    });
}
```

---

## 2. Vi Presence Header

### Current State
Generic top bar shows:
- "Vi offline — start via Control tab"
- "Operator: [UUID]"
- "Tier: Standard"

### New State
Active presence strip shows:
```
┌──────────────────────────────────────────────────────────────┐
│ VI — ONLINE                                                  │
│ Stance: Balanced | Mood: Neutral | Recognition: Shykem (0.82)│
└──────────────────────────────────────────────────────────────┘
```

### Components

**1. Status Indicator**
- "VI — ONLINE" (green pulse)
- "VI — OFFLINE" (red)
- "VI — BOOTING" (gold animation)
- "VI — CRASHED" (red, bold)

**2. Stance**
- From `/api/vi/status` → `stance.stance`
- Shows: "Balanced", "Cautious", "Assertive", etc.

**3. Mood**
- From `/api/vi/status` → `stance.mood`
- Shows: "Neutral", "Engaged", "Concerned", "Confident", etc.

**4. Operator Recognition**
- Display name from voice profile
- Trust score (0-1.0)
- Shows as: "Shykem Middleton (0.82)"

### HTML Structure

```html
<!-- Replace old top bar with presence strip -->
<div id="viPresenceHeader" class="vi-presence-header">
  <div class="presence-status">
    <span class="status-indicator" id="viStatusBadge">VI — ONLINE</span>
  </div>
  
  <div class="presence-state">
    <div class="presence-item">
      <span class="label">Stance</span>
      <span class="value" id="viStance">Balanced</span>
    </div>
    <span class="divider">|</span>
    
    <div class="presence-item">
      <span class="label">Mood</span>
      <span class="value" id="viMood">Neutral</span>
    </div>
    <span class="divider">|</span>
    
    <div class="presence-item">
      <span class="label">Recognition</span>
      <span class="value" id="viRecognition">Shykem (0.82)</span>
    </div>
  </div>
  
  <div class="presence-actions">
    <button class="btn-sm gold" id="viPresenceDetails">Details</button>
  </div>
</div>
```

### CSS Styling

```css
.vi-presence-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 20px;
  align-items: center;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 8px;
  margin-bottom: 16px;
}

.presence-status {
  display: flex;
  align-items: center;
}

.status-indicator {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--green);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-indicator::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator.offline {
  color: var(--red);
}

.status-indicator.offline::before {
  background: var(--red);
  animation: none;
}

.status-indicator.booting {
  color: var(--gold);
}

.status-indicator.booting::before {
  background: var(--gold);
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.presence-state {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.presence-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.presence-item .label {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.presence-item .value {
  font-size: 13px;
  color: var(--gold);
  font-weight: 600;
}

.divider {
  color: rgba(212, 175, 55, 0.2);
}

.presence-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid rgba(212, 175, 55, 0.3);
  background: rgba(212, 175, 55, 0.05);
  color: var(--gold);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-sm:hover {
  background: rgba(212, 175, 55, 0.15);
  border-color: rgba(212, 175, 55, 0.5);
}
```

### JavaScript Update

```javascript
async function updateViPresenceHeader() {
  try {
    const status = await fetch('/api/vi/status').then(r => r.json());
    
    const indicator = document.getElementById('viStatusBadge');
    const stanceVal = document.getElementById('viStance');
    const moodVal = document.getElementById('viMood');
    const recognition = document.getElementById('viRecognition');
    
    // Update status
    if (status.online) {
      indicator.textContent = 'VI — ONLINE';
      indicator.className = 'status-indicator online';
    } else if (status.booting) {
      indicator.textContent = 'VI — BOOTING';
      indicator.className = 'status-indicator booting';
    } else if (status.crashed) {
      indicator.textContent = 'VI — CRASHED';
      indicator.className = 'status-indicator offline';
    } else {
      indicator.textContent = 'VI — OFFLINE';
      indicator.className = 'status-indicator offline';
    }
    
    // Update stance/mood
    stanceVal.textContent = status.stance?.stance || 'Unknown';
    moodVal.textContent = status.stance?.mood || 'Unknown';
    
    // Update operator recognition
    const displayName = authState.currentUser?.voice_profile?.displayName 
      || authState.currentUser?.username 
      || 'Unknown Operator';
    const trustLevel = (status.operatorTrust || 0).toFixed(2);
    recognition.textContent = `${displayName} (${trustLevel})`;
    
  } catch (err) {
    console.warn('Failed to update Vi presence:', err);
  }
}

// Update presence every 2 seconds
setInterval(updateViPresenceHeader, 2000);
```

---

## 3. Replace UUID Display with Identity

### Before
```
User: 6723-2f9b-4d1a-b8c2
Tier: Standard
```

### After
```
Operator: Shykem Middleton
Tier: Creator (full access)
Relationship: 100% trusted
```

### Data Mapping

```javascript
function getOperatorDisplayInfo(user) {
  const profile = user.voice_profile || {};
  const displayName = profile.displayName || user.username || user.email;
  const relationship = getRelationship(user);
  const tier = getTier(user);
  
  return {
    displayName,
    relationship,
    tier,
    trustLevel: profile.trustLevel || 0,
    tone: profile.tone || 'balanced'
  };
}

function getRelationship(user) {
  const profile = user.voice_profile || {};
  const rel = profile.relationship || 'unknown';
  
  const labels = {
    'creator': '👑 Creator (full access)',
    'ally': '🤝 Ally (trusted)',
    'guardian': '🛡️ Guardian (protective)',
    'unknown': '🤔 Unknown'
  };
  
  return labels[rel];
}

function getTier(user) {
  // From user.tier or role
  const tier = user.tier || 'standard';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
```

### User Info Bar Redesign

```html
<div id="userInfoBar" class="user-info-bar">
  <div class="operator-identity">
    <div class="display-name" id="operatorName">Shykem Middleton</div>
    <div class="operator-meta">
      <span class="tier-badge gold" id="operatorTier">Creator</span>
      <span class="relationship-badge" id="operatorRelationship">100% trusted</span>
    </div>
  </div>
  
  <div class="operator-actions">
    <button class="btn-sm" id="operatorSettings">Profile Settings</button>
    <button class="btn-sm gold" id="topLogoutBtn">Logout</button>
  </div>
</div>
```

---

## 4. Interaction Style Integration

### By Tone Preference

**Direct Mode:**
```javascript
// Abbreviated messages, terse responses
function formatMessage(text, tone = 'balanced') {
  if (tone === 'direct') {
    return text.replace(/\band\b/gi, '&').slice(0, 80) + '...';
  }
  return text;
}

// Shows: "Vi status: online & ready"
// vs.  "Vi status: online and ready"
```

**Balanced Mode (default):**
```javascript
// Professional, clear, conversational
// "Vi is online and ready to assist."
```

**Soft Mode:**
```javascript
// Warm, supportive, encouraging
// "Vi is happy to see you and ready to help with whatever you need!"
```

---

## 5. Cognitive Sidebar (Right Panel)

### Layout
```
┌─────────────────────────────────┐
│  COMMAND DECK                   │
│  Chat area (70% width)          │
└─────────────────────────────────┐─────────────────────────────────┐
│  COGNITIVE STATE (Real-Time)    │                                 │
│  ─────────────────────────────  │                                 │
│  Stance: Balanced               │                                 │
│  Mood: Neutral                  │                                 │
│  Constraints: [3 active]        │                                 │
│  ─────────────────────────────  │                                 │
│  Reasoning:                     │                                 │
│  • User query detected          │                                 │
│  • Context: conversation state  │                                 │
│  • Intent: information request  │                                 │
│  ─────────────────────────────  │                                 │
│  Memory Recalls:                │                                 │
│  • Fact: Shykem -> Creator      │                                 │
│  • Context: previous session    │                                 │
│  ─────────────────────────────  │                                 │
│  Governor Status:               │                                 │
│  • Check: coherence ✓           │                                 │
│  • Check: safety ✓              │                                 │
│  • Check: alignment ✓           │                                 │
│                                 │                                 │
└─────────────────────────────────┘                                 │
```

---

## 6. Database Schema Updates

```sql
-- Enhance users table
ALTER TABLE users ADD COLUMN voice_profile JSON DEFAULT '{}';
ALTER TABLE users ADD COLUMN last_interaction TIMESTAMP DEFAULT NOW();

-- Create operator_recognition table for trust tracking
CREATE TABLE operator_recognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  recognition_date TIMESTAMP DEFAULT NOW(),
  
  -- Recognition metrics
  interaction_count INT DEFAULT 1,
  average_session_duration INTERVAL,
  pattern_consistency FLOAT DEFAULT 0.0,
  command_accuracy FLOAT DEFAULT 1.0,
  
  -- Trust score
  trust_score FLOAT DEFAULT 0.5,
  trust_factors JSONB DEFAULT '{}',
  
  -- Relationship
  relationship VARCHAR(50) DEFAULT 'unknown',
  preferred_tone VARCHAR(20) DEFAULT 'balanced',
  
  CONSTRAINT trust_score_range CHECK (trust_score >= 0 AND trust_score <= 1.0)
);

-- Create indexes for performance
CREATE INDEX idx_operator_recognition_user_id 
  ON operator_recognition(user_id);
CREATE INDEX idx_operator_recognition_date 
  ON operator_recognition(recognition_date DESC);
```

---

## 7. Implementation Timeline

### Week 1: Voice Profile
- [ ] Database schema update
- [ ] /api/profile/voice-setup endpoint
- [ ] Voice profile modal UI
- [ ] First-time user detection
- [ ] Profile persistence

### Week 2: Vi Presence Header
- [ ] Update /api/vi/status to include mood/stance
- [ ] Create presence header component
- [ ] Add presenceStatusBadge with pulsing animation
- [ ] Integrate with Vi status polling
- [ ] Handle offline/booting/crashed states

### Week 3: Identity Integration
- [ ] Replace UUID display with operator name
- [ ] Create operator_recognition table
- [ ] Calculate trust scores
- [ ] Reframe relationship labels
- [ ] Update user info bar

### Week 4: Interaction Style
- [ ] Implement tone-based message formatting
- [ ] Add cognitive sidebar component
- [ ] Real-time reasoning/memory display
- [ ] Governor status visualization
- [ ] Settings panel for preference changes

---

## 8. API Endpoints (New)

```
POST   /api/profile/voice-setup          - Set operator voice profile
GET    /api/profile/{userId}/voice       - Get voice profile
PATCH  /api/profile/{userId}/voice       - Update voice profile

GET    /api/vi/presence                  - Get Vi presence state
GET    /api/vi/stance                    - Get Vi stance/mood
GET    /api/vi/recognition/{userId}      - Get operator recognition data

POST   /api/operator/trust/update         - Update trust metrics
GET    /api/operator/relationship         - Get operator relationship
```

---

## 9. Future Enhancements (Phase 4+)

- Voice-based interactions (speech-to-text)
- Emotional reflection ("Vi mirrors your mood")
- Personalized response templates
- Cross-session memory ("I remember we discussed...")
- Passkey/biometric authentication
- Multi-device operator awareness
- Operator team management
- Session recording and playback

---

## Success Criteria

✅ First-time users prompted for voice profile
✅ Operator name displayed instead of UUID
✅ Vi presence header shows live status
✅ Stance/mood/recognition updates in real-time
✅ Interaction style matches tone preference
✅ Trust score reflects operator history
✅ Cognitive sidebar shows real-time reasoning
✅ Relationship label updates as trust changes
✅ All data persists across sessions
✅ No performance degradation

---

**Phase 3 Status:** 🎯 Design Complete, Ready for Implementation
**Estimated Duration:** 2-3 weeks
**Complexity:** Medium
**Priority:** High
