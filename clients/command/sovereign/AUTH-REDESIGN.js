/**
 * TENTAI GOD CONSOLE - PREMIUM AUTH LOGIC
 * Smart UX: error handling, loading states, dev quick-fill, cooldowns
 * 
 * Add this before the existing auth JavaScript
 */

// Auth State
const authUX = {
  loginAttempts: 0,
  lastFailureTime: null,
  cooldownDuration: 10000, // 10 seconds
  isCoolingDown: false,
};

// Detect dev mode
const isDev = () => {
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         process.env.NODE_ENV === 'development';
};

// Initialize dev quick fill if in dev mode
function initDevQuickFill() {
  const devBtn = document.getElementById('devQuickFillBtn');
  const devSection = document.getElementById('devQuickFill');
  
  if (isDev() && devBtn && devSection) {
    devSection.style.display = 'block';
    devBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('loginEmail').value = 'Shykem.middleton@gmail.com';
      document.getElementById('loginPassword').value = 'password123';
      document.getElementById('loginEmail').focus();
      clearAuthErrors();
    });
  }
}

// Set environment label
function initEnvironmentLabel() {
  const envLabel = document.getElementById('envLabel');
  if (envLabel && isDev()) {
    envLabel.textContent = 'Local Development';
  }
}

// Clear all field errors
function clearAuthErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.classList.remove('show');
    el.textContent = '';
  });
  document.querySelectorAll('.auth-form input').forEach(el => {
    el.classList.remove('error');
  });
  const banner = document.getElementById('authBanner');
  if (banner) banner.style.display = 'none';
}

// Show field-specific error
function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}Error`);
  
  if (input && errorEl) {
    input.classList.add('error');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    
    // Clear error when user types
    input.addEventListener('input', () => {
      input.classList.remove('error');
      errorEl.classList.remove('show');
    }, { once: true });
  }
}

// Show global error banner
function showAuthBanner(message) {
  const banner = document.getElementById('authBanner');
  if (banner) {
    banner.textContent = message;
    banner.style.display = 'block';
  }
}

// Set loading state on button
function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  if (loading) {
    btn.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'button-spinner';
    spinner.id = `${btnId}Spinner`;
    const text = btn.querySelector('span');
    if (text) {
      text.textContent = 'Authenticating…';
      btn.insertBefore(spinner, text);
    }
  } else {
    btn.disabled = false;
    const spinner = btn.querySelector('.button-spinner');
    if (spinner) spinner.remove();
    const text = btn.querySelector('span');
    if (text) text.textContent = 'Authorize';
  }
}

// Start cooldown timer
function startCooldown() {
  authUX.isCoolingDown = true;
  authUX.loginAttempts++;
  authUX.lastFailureTime = Date.now();
  
  const cooldownDiv = document.getElementById('loginCooldown');
  const timerSpan = document.getElementById('cooldownTimer');
  const loginBtn = document.getElementById('loginBtn');
  
  if (cooldownDiv && loginBtn) {
    cooldownDiv.style.display = 'block';
    loginBtn.disabled = true;
    
    let secondsLeft = authUX.cooldownDuration / 1000;
    timerSpan.textContent = secondsLeft;
    
    const interval = setInterval(() => {
      secondsLeft--;
      timerSpan.textContent = secondsLeft;
      
      if (secondsLeft <= 0) {
        clearInterval(interval);
        cooldownDiv.style.display = 'none';
        loginBtn.disabled = false;
        authUX.isCoolingDown = false;
        authUX.loginAttempts = 0;
      }
    }, 1000);
  }
}

// Shake animation on failure
function shakeCard() {
  const panel = document.getElementById('authPanel');
  if (panel) {
    panel.classList.add('error-shake');
    setTimeout(() => panel.classList.remove('error-shake'), 400);
  }
}

// Validate login form
function validateLoginForm() {
  clearAuthErrors();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  let isValid = true;
  
  if (!email) {
    showFieldError('loginEmail', 'Email is required');
    isValid = false;
  } else if (!email.includes('@')) {
    showFieldError('loginEmail', 'Enter a valid email address');
    isValid = false;
  }
  
  if (!password) {
    showFieldError('loginPassword', 'Password is required');
    isValid = false;
  } else if (password.length < 1) {
    showFieldError('loginPassword', 'Enter your password');
    isValid = false;
  }
  
  return isValid;
}

// Validate register form
function validateRegisterForm() {
  clearAuthErrors();
  const displayName = document.getElementById('registerDisplayName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
  
  let isValid = true;
  
  if (!displayName) {
    showFieldError('registerDisplayName', 'Display name is required');
    isValid = false;
  }
  
  if (!email) {
    showFieldError('registerEmail', 'Email is required');
    isValid = false;
  } else if (!email.includes('@')) {
    showFieldError('registerEmail', 'Enter a valid email address');
    isValid = false;
  }
  
  if (!username) {
    showFieldError('registerUsername', 'Username is required');
    isValid = false;
  } else if (username.length < 3 || username.length > 50) {
    showFieldError('registerUsername', 'Username must be 3-50 characters');
    isValid = false;
  } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    showFieldError('registerUsername', 'Username: alphanumeric, hyphens, underscores only');
    isValid = false;
  }
  
  if (!password) {
    showFieldError('registerPassword', 'Password is required');
    isValid = false;
  } else if (password.length < 8) {
    showFieldError('registerPassword', 'Password must be at least 8 characters');
    isValid = false;
  }
  
  if (password !== confirmPassword) {
    showFieldError('registerConfirmPassword', 'Passwords do not match');
    isValid = false;
  }
  
  return isValid;
}

// Override login function with enhanced UX
async function loginWithUX(email, password) {
  clearAuthErrors();
  
  if (authUX.isCoolingDown) {
    showAuthBanner('Too many failed attempts. Please wait before trying again.');
    return;
  }
  
  setButtonLoading('loginBtn', true);
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let msg = '';
      try {
        const errData = await res.json();
        msg = errData?.error || errData?.message || '';
      } catch (_) {
        msg = await res.text();
      }
      
      shakeCard();
      showAuthBanner('Authentication Failed');
      showFieldError('loginPassword', 'Check credentials and try again');
      
      if (authUX.loginAttempts >= 3) {
        startCooldown();
      }
      
      authUX.loginAttempts++;
      setButtonLoading('loginBtn', false);
      return;
    }

    const raw = await res.json();
    const data = raw?.data || raw;
    
    if (!data?.accessToken || !data?.refreshToken) {
      throw new Error('Invalid auth response');
    }
    
    saveTokens(data.accessToken, data.refreshToken);
    const userFromToken = setCurrentUserFromToken(data.accessToken);
    await fetchUserProfile();
    
    // Boot transition (see #6 in requirements)
    showBootTransition(userFromToken);
    
  } catch (err) {
    shakeCard();
    showAuthBanner('Authentication Failed');
    showFieldError('loginPassword', err.message || 'Check credentials and try again');
    setButtonLoading('loginBtn', false);
  }
}

// Boot transition screen (fake theater for #6)
async function showBootTransition(user) {
  const authPane = document.getElementById('authPane');
  const bootScreen = document.createElement('div');
  bootScreen.style.cssText = `
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(91, 46, 145, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 20px;
    z-index: 9999;
    color: var(--gold);
    font-family: 'Segoe UI', system-ui, sans-serif;
  `;
  
  const title = document.createElement('div');
  title.style.cssText = 'font-size: 20px; font-weight: 700; letter-spacing: 1px;';
  title.textContent = 'Operator Verified';
  bootScreen.appendChild(title);
  
  const messages = ['Binding session…', 'Syncing console permissions…', 'Preparing evidence vault…'];
  
  for (let msg of messages) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size: 13px; color: rgba(212, 175, 55, 0.7); opacity: 0; animation: fadeIn 0.3s ease forwards;';
    msgEl.textContent = msg;
    bootScreen.appendChild(msgEl);
  }
  
  // Transition to console
  await new Promise(resolve => setTimeout(resolve, 800));
  bootScreen.style.animation = 'fadeOut 0.5s ease forwards';
  
  setTimeout(() => {
    bootScreen.remove();
    authPane.style.display = 'none';
    updateAuthUI();
    showControls();
    hideError();
  }, 500);
}

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);

// Initialize all UX enhancements when page loads
window.addEventListener('DOMContentLoaded', () => {
  initEnvironmentLabel();
  initDevQuickFill();
  
  // Hook up login button
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      if (validateLoginForm()) {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        await loginWithUX(email, password);
      }
    });
  }
  
  // Hook up register button
  const registerBtn = document.getElementById('registerBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      if (validateRegisterForm()) {
        const displayName = document.getElementById('registerDisplayName').value.trim();
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value.trim();
        
        // Call existing register function (add UX wrapper)
        setButtonLoading('registerBtn', true);
        await register(username, email, password, displayName);
        setButtonLoading('registerBtn', false);
      }
    });
  }
  
  // Password toggles
  const toggleLogin = document.getElementById('toggleLoginPassword');
  if (toggleLogin) {
    toggleLogin.addEventListener('click', () => {
      const input = document.getElementById('loginPassword');
      if (input.type === 'password') {
        input.type = 'text';
        toggleLogin.textContent = '👁‍🗨';
      } else {
        input.type = 'password';
        toggleLogin.textContent = '👁';
      }
    });
  }
  
  const toggleRegister = document.getElementById('toggleRegisterPassword');
  if (toggleRegister) {
    toggleRegister.addEventListener('click', () => {
      const input = document.getElementById('registerPassword');
      if (input.type === 'password') {
        input.type = 'text';
        toggleRegister.textContent = '👁‍🗨';
      } else {
        input.type = 'password';
        toggleRegister.textContent = '👁';
      }
    });
  }
  
  // Form toggles
  const showRegister = document.getElementById('showRegisterForm');
  if (showRegister) {
    showRegister.addEventListener('click', () => {
      clearAuthErrors();
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('registerForm').style.display = 'block';
    });
  }
  
  const showLogin = document.getElementById('showLoginForm');
  if (showLogin) {
    showLogin.addEventListener('click', () => {
      clearAuthErrors();
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
    });
  }
  
  // Enter key support
  ['loginEmail', 'loginPassword'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
      });
    }
  });
});
