# TENTAI GOD CONSOLE - AUTH UX TEST GUIDE

## Quick Start Testing

### Test Environment
- **URL:** http://localhost:3001
- **Test Email:** Shykem.middleton@gmail.com
- **Test Password:** password123
- **Environment:** Localhost (shows "Local Development" label)

---

## Visual Features to Verify

### 1. Brand Header
**Expected:** Top of auth panel shows:
```
TENTAI // GOD CONSOLE
Operator Access Required
Local Development
```

**Test:** ✓ Open http://localhost:3001
- Should see gold "TENTAI // GOD CONSOLE" title
- Should see gray "Operator Access Required" subtitle
- Should see dimmed "Local Development" label

---

### 2. Form Groups
**Expected:** Each field has:
- Uppercase gray label
- Emoji icon on left side
- Placeholder text
- Helper text visible on focus

**Test:** ✓ Click on email field
- Label shows: "Email"
- Icon shows: "✉"
- Focus border glows with gold
- Helper text appears: "Your operator identity"

**Test:** ✓ Click on password field
- Label shows: "Password"
- Icon shows: "🔐"
- Focus border glows with gold
- Helper text doesn't show (password field specific)

---

### 3. Password Toggle
**Expected:** Right side of password field has eye button

**Test:** ✓ Click eye icon (👁)
- Password becomes visible
- Icon changes to (👁‍🗨)
- Click again to hide

**Test:** ✓ Toggle register password fields
- Same behavior for registration form

---

### 4. Dev Quick-Fill
**Expected:** At bottom of login form (localhost only)

**Test:** ✓ Scroll down in login form
- Should see green section: "Use test operator (dev only)"
- Click to auto-fill test credentials
- Fields populate: Shykem.middleton@gmail.com / password123

**Test Note:** This will NOT appear on production (non-localhost)

---

### 5. Error Validation - Email Field

**Test Case 1:** Submit with empty email
- Click [Authorize] with empty email
- Red error appears: "Email is required"
- Field border turns red
- Type in field → error disappears

**Test Case 2:** Submit with invalid email
- Type "notanemail"
- Click [Authorize]
- Red error appears: "Enter a valid email address"
- Type another character → error clears

---

### 6. Error Validation - Password Field

**Test Case 1:** Submit with empty password
- Click [Authorize] with empty password
- Red error appears: "Password is required"
- Field border turns red
- Type in field → error disappears

**Test Case 2:** Wrong password
- Email: Shykem.middleton@gmail.com
- Password: wrongpassword
- Click [Authorize]
- Card shakes (error animation)
- Global red banner appears: "Authentication Failed"
- Field error appears: "Check credentials and try again"

---

### 7. Cool-Down Timer

**Test Case 1:** Trigger cool-down
1. Try login 3 times with wrong password
2. After 3rd failure:
   - Red message appears: "Try again in 10s"
   - Button shows disabled state
   - Timer counts down: 10, 9, 8...

**Test Case 2:** Cool-down expires
   - Wait for countdown to reach 0
   - Timer disappears
   - Button becomes enabled again
   - Attempt counter resets

---

### 8. Loading State

**Test Case 1:** See loading spinner
1. Enter correct credentials
2. Click [Authorize]
3. Button should show:
   - Spinning circle (gold)
   - Text changes to "Authenticating…"
   - Button disabled (grayed out)

**Test Case 2:** Loading completes
   - After server responds, spinner disappears
   - If successful: boot transition shows
   - If failed: error handling shows instead

---

### 9. Boot Transition

**Test Case 1:** Successful login shows transition
1. Enter correct credentials:
   - Email: Shykem.middleton@gmail.com
   - Password: password123
2. Click [Authorize]
3. Full-screen overlay appears with:
   - Gradient background (dark blue/purple)
   - Gold text: "Operator Verified"
   - Sequential messages appear with 500ms delays:
     1. "Binding session…"
     2. "Syncing console permissions…"
     3. "Preparing evidence vault…"
4. After ~2 seconds total: Overlay fades out
5. Console UI appears (Chat, Control, Insights tabs)

---

### 10. Form Switching

**Test Case 1:** Switch to register
- Click "Create Operator Profile" link
- Login form disappears
- Register form appears with fields:
  - Display Name (👤)
  - Email (✉)
  - Username (@)
  - Password (🔐)
  - Confirm Password (✓)
- All field helpers visible on focus

**Test Case 2:** Switch back to login
- Click "Back to Authorization" link
- Register form disappears
- Login form re-appears with just Email and Password

---

### 11. Register Form Validation

**Test Case 1:** Display name required
- Click [Provision Access] with empty display name
- Error: "Display name is required"

**Test Case 2:** Email validation
- Enter invalid email "notanemail"
- Error: "Enter a valid email address"

**Test Case 3:** Username validation
- Try username with only 2 chars "ab"
- Error: "Username must be 3-50 characters"
- Try username with special chars "ab@cd"
- Error: "Username: alphanumeric, hyphens, underscores only"
- Valid: "ab_cd-123" ✓

**Test Case 4:** Password length
- Try password with 7 chars "abcdefg"
- Error: "Password must be at least 8 characters"

**Test Case 5:** Confirm password
- Password: "password123"
- Confirm: "password456"
- Error: "Passwords do not match"

---

### 12. Enter Key Support

**Test Case 1:** Login form
- Type email
- Press Enter → goes to password
- Type password
- Press Enter → submits login form

**Test Case 2:** Register form
- Each field supports Enter key
- Last field (Confirm Password) + Enter → submits register

---

### 13. Visual Polish

**Test Case 1:** Button hover states
- Hover over [Authorize] or [Provision Access]
- Button should glow with gold shadow
- Button should lift slightly (translateY)

**Test Case 2:** Error shake animation
- Deliberately enter wrong password 3x
- On the 2nd and 3rd attempts, card should shake
- Shake is quick and smooth (0.4s)

**Test Case 3:** Color consistency
- Gold elements: buttons, labels, title, icons
- Red elements: errors, failure messages
- Green elements: dev quick-fill section
- Dark background: matches console aesthetic

---

## Automated Tests (PowerShell)

### Test 1: Correct Credentials
```powershell
$body = @{ 
  email = "Shykem.middleton@gmail.com"
  password = "password123" 
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" `
  -Method Post `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body `
  -UseBasicParsing

$response.Content | ConvertFrom-Json | Select-Object -ExpandProperty data
```

**Expected:**
- `accessToken` present (JWT)
- `refreshToken` present
- `expiresIn` present (900 for 15 minutes)

### Test 2: Wrong Credentials
```powershell
$body = @{ 
  email = "Shykem.middleton@gmail.com"
  password = "wrongpassword" 
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" `
  -Method Post `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body `
  -UseBasicParsing -ErrorAction Continue

$response.Content | ConvertFrom-Json
```

**Expected:**
- `statusCode` 401
- `error` message present
- No `accessToken` returned

### Test 3: Missing Email
```powershell
$body = @{ 
  email = ""
  password = "password123" 
} | ConvertTo-Json

# Should fail with 400 Bad Request
```

---

## Browser DevTools Checks

### Console Tab
**Look for:**
- No JavaScript errors
- Auth UX initialized message (optional)
- Smooth transitions and animations

### Network Tab
**Monitor:**
- POST to /api/auth/login
- Response headers include auth tokens
- No failed requests

### Performance Tab
**Check:**
- Boot transition completes in ~2 seconds
- No jank or stuttering
- Smooth animations (60fps)

---

## Accessibility Checks

### Keyboard Navigation
- Tab through form fields
- Enter submits form
- Tab highlight visible on all inputs
- Labels readable and associated

### Color Contrast
- Error text (red) readable on background
- Gold text readable on dark background
- Success messages clear

### Screen Reader (if available)
- Form labels announced
- Error messages announced
- Helper text readable

---

## Mobile/Responsive Checks

### Mobile (320px width)
- Auth panel should be max-width: 420px
- Form fields should stack vertically
- Buttons should be full-width
- Touch targets should be 44px minimum

### Tablet (768px width)
- Auth panel centered on screen
- All features visible
- Scrollable if needed

---

## Security Validation

### Check 1: Credentials Storage
- Passwords NOT displayed in console logs
- Tokens stored in localStorage/sessionStorage (not cookies for now)
- No credentials sent unencrypted

### Check 2: Dev Mode Detection
- Dev quick-fill ONLY appears on localhost
- Not accessible via network IP (127.0.0.1)
- Production deployment won't show this

### Check 3: Cool-Down Protection
- After 3 failures, cool-down enforced
- Cannot bypass with rapid clicks
- Timer counts down correctly

### Check 4: Token Handling
- JWT tokens present in localStorage after login
- Tokens sent in Authorization header for protected endpoints
- Refresh token used to get new access token

---

## Edge Cases to Test

### 1. Double-Click Authorize
- Click button twice rapidly
- Should only submit once
- Loading state should prevent duplicates

### 2. Form Submission While Loading
- Start login, then click register form link
- Should cancel pending request
- Should show register form

### 3. Network Timeout
- Disable internet/close server
- Click [Authorize]
- Should show error: "Authentication Failed"
- Should recover gracefully

### 4. Session Timeout
- Login successfully
- Wait 15+ minutes
- Token expires
- Next request should use refresh token
- If refresh fails, should return to login

### 5. Cookie/Storage Clearing
- Login successfully
- Open DevTools → Storage → Clear All
- Refresh page
- Should return to login (not logged in)

---

## Success Criteria

### All Tests Pass When:
✅ Brand header displays correctly
✅ Form fields have icons, labels, helper text
✅ Error messages appear correctly
✅ Error messages clear on user input
✅ Cool-down timer works (10 seconds, 3 failures)
✅ Dev quick-fill appears on localhost only
✅ Loading spinner shows during auth
✅ Boot transition displays correctly
✅ Form switching works smoothly
✅ Password toggle works
✅ All validations work
✅ Enter key submits forms
✅ Animations are smooth (no jank)
✅ No console errors
✅ Mobile responsive
✅ Accessibility standards met

---

## Known Limitations (Planned for Phase 3)

- Voice profile capture not implemented yet
- Vi presence header not implemented yet
- No 2FA/passkey support yet
- No account recovery flow yet
- No email verification yet
- No password reset flow yet

---

## Deployment Verification

**After deploying to production:**

1. Verify dev quick-fill does NOT appear
2. Verify environment label does NOT show
3. All other features work identically
4. No errors in production console
5. Login rate limiting works
6. Session management works

---

## Support Contacts

For issues with premium auth UX:
- Check this guide first
- Check console for error messages
- Verify test credentials: Shykem.middleton@gmail.com / password123
- Verify database connectivity
- Check docker logs: `docker logs sovereign`

---

**Test Date:** [Fill in when testing]
**Tester Name:** [Fill in when testing]
**Status:** ✅ Ready for QA
