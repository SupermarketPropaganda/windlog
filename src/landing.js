import { authService, safeStorage } from './services/auth-service';

// ─── STATE MANAGEMENT ───
let currentUser = null;
let savedPreviousPane = 'signin';

authService.onAuthStateChanged((session) => {
  const user = session.isAuthenticated && !session.user?.isAnonymous ? session.user : null;
  currentUser = user ? { id: user.id, name: user.displayName, email: user.email,
    license: user.pilotLicense, homeBase: user.homeBaseAirport } : null;
  renderAuthState();
});
window.addEventListener('pageshow', () => authService.init());
const initialPane = { '#login': 'signin', '#signin': 'signin', '#register': 'register', '#signup': 'register' }[window.location.hash];
if (initialPane) openModal(initialPane);

// ─── MODAL CONTROLS ───
function openModal(paneName) {
  document.getElementById('modalBackdrop').classList.add('open');
  switchPane(paneName);
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  clearAlerts();
}

function handleBackdropClick(e) {
  if (e.target.id === 'modalBackdrop') {
    closeModal();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function switchPane(paneName) {
  const panes = ['paneSignIn', 'paneRegister', 'paneForgot', 'paneMagic', 'paneAccount', 'paneGoogle', 'paneLegal'];
  panes.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const tabs = document.getElementById('authTabs');
  const tabSignIn = document.getElementById('tabSignIn');
  const tabRegister = document.getElementById('tabRegister');

  if (paneName === 'signin' || paneName === 'register') {
    tabs.style.display = 'flex';
    tabSignIn.classList.toggle('active', paneName === 'signin');
    tabRegister.classList.toggle('active', paneName === 'register');
  } else {
    tabs.style.display = 'none';
  }

  if (paneName === 'signin') document.getElementById('paneSignIn').classList.add('active');
  if (paneName === 'register') document.getElementById('paneRegister').classList.add('active');
  if (paneName === 'forgot') {
    document.getElementById('paneForgot').classList.add('active');
    resetForgotSteps();
  }
  if (paneName === 'magic') {
    document.getElementById('paneMagic').classList.add('active');
    resetMagicStep();
  }
  if (paneName === 'account') {
    document.getElementById('paneAccount').classList.add('active');
    populateAccountFields();
  }
  if (paneName === 'google') document.getElementById('paneGoogle').classList.add('active');
  if (paneName === 'legal') document.getElementById('paneLegal').classList.add('active');

  clearAlerts();
}

function clearAlerts() {
  const siAlert = document.getElementById('signInAlert');
  const regAlert = document.getElementById('regAlert');
  if (siAlert) { siAlert.className = 'alert-box'; siAlert.textContent = ''; }
  if (regAlert) { regAlert.className = 'alert-box'; regAlert.textContent = ''; }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3800);
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'HIDE';
  } else {
    input.type = 'password';
    btn.textContent = 'SHOW';
  }
}



// ─── AUTHENTICATION ACTIONS ───
function renderAuthState() {
  const unauth = document.getElementById('unauthActions');
  const auth = document.getElementById('authActions');
  const nameEl = document.getElementById('userDisplayName');

  if (currentUser) {
    unauth.style.display = 'none';
    auth.style.display = 'flex';
    nameEl.textContent = `capt. ${currentUser.name} // signed in`;
  } else {
    unauth.style.display = 'flex';
    auth.style.display = 'none';
  }
}

async function handleSignInSubmit(e) {
  e.preventDefault();
  clearAlerts();
  const email = document.getElementById('siEmail').value.trim().toLowerCase();
  const password = document.getElementById('siPassword').value;

  if (!email || !password) {
    showSignInError('Please enter both email and master password.');
    return;
  }

  const button = e.currentTarget.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await authService.signIn(email, password, document.getElementById('siRemember').checked);
    enterCockpit();
  } catch (error) {
    showSignInError(error.message || 'Unable to sign in.');
  } finally { button.disabled = false; }
}


function showSignInError(msg) {
  const alert = document.getElementById('signInAlert');
  alert.className = 'alert-box error';
  alert.textContent = msg;
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearAlerts();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  const terms = document.getElementById('regTerms').checked;

  if (!name) {
    showRegError('Please enter your full name or callsign.');
    return;
  }
  if (!email || !email.includes('@') || !email.includes('.')) {
    showRegError('Please provide a valid pilot email address.');
    return;
  }
  if (password.length < 8) {
    showRegError('Master password must be at least 8 characters.');
    return;
  }
  if (password !== confirm) {
    showRegError('Passwords do not match. Please verify.');
    return;
  }
  if (!terms) {
    showRegError('You must agree to the Aeronautical Terms to register.');
    return;
  }

  const button = e.currentTarget.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await authService.signUp({ email, password, displayName: name });
    enterCockpit();
  } catch (error) {
    showRegError(error.message || 'Unable to register.');
  } finally { button.disabled = false; }
}


function showRegError(msg) {
  const alert = document.getElementById('regAlert');
  alert.className = 'alert-box error';
  alert.textContent = msg;
}

function evaluatePasswordStrength(val) {
  let score = 0;
  const len = val.length >= 8;
  const upper = /[A-Z]/.test(val);
  const num = /[0-9]/.test(val);
  const sym = /[^A-Za-z0-9]/.test(val);

  document.getElementById('critLen').className = 'criterion ' + (len ? 'valid' : '');
  document.getElementById('critUpper').className = 'criterion ' + (upper ? 'valid' : '');
  document.getElementById('critNum').className = 'criterion ' + (num ? 'valid' : '');
  document.getElementById('critSym').className = 'criterion ' + (sym ? 'valid' : '');

  if (len) score++;
  if (upper) score++;
  if (num) score++;
  if (sym) score++;

  const bars = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3'), document.getElementById('bar4')];
  const text = document.getElementById('strengthLabelText');

  const colors = ['#ef4444', '#f97316', '#eab800', '#10b981'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  bars.forEach((b, i) => {
    if (i < score) {
      b.style.background = colors[score - 1];
    } else {
      b.style.background = 'rgba(255, 255, 255, 0.1)';
    }
  });

  text.textContent = score > 0 ? labels[score - 1] : 'None';
  text.style.color = score > 0 ? colors[score - 1] : 'rgba(255,255,255,0.45)';
}

// ─── REAL GOOGLE IDENTITY SERVICES ───
function handleGoogleAuth() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || safeStorage.getItem('windlog_google_client_id') || '';
  if (!clientId) {
    showToast('Google sign-in is not enabled. Please use your email and password.');
    return;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    showToast('Google Identity Services script is loading. Please check internet connection.');
    return;
  }

  try {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'email profile openid',
      callback: async (resp) => {
        if (resp.error) {
          showToast(`Google authentication error: ${resp.error}`);
          return;
        }
        try {
          showToast('Fetching Google verified profile...');
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });
          if (!res.ok) throw new Error('Failed to retrieve Google profile data.');
          const profile = await res.json();
          const email = profile.email.toLowerCase();
          const name = profile.name || email.split('@')[0];

          await authService.signInWithOAuthUser({ email, displayName: name, provider: 'Google' });
          enterCockpit();


        } catch (e) {
          showToast('Failed to retrieve Google profile data: ' + e.message);
        }
      }
    });
    client.requestAccessToken();
  } catch (err) {
    showToast('Failed to start Google sign-in: ' + err.message);
  }
}

function saveGoogleClientId() {
  const val = document.getElementById('googleClientIdInput').value.trim();
  if (!val || !val.includes('.apps.googleusercontent.com')) {
    showToast('Please enter a valid Google Client ID (format: xxxxx.apps.googleusercontent.com)');
    return;
  }
  safeStorage.setItem('windlog_google_client_id', val);
  showToast('Google Client ID configured. Connecting...');
  switchPane('signin');
  setTimeout(() => {
    handleGoogleAuth();
  }, 250);
}

function resetForgotSteps() {}
function resetMagicStep() {}
function sendForgotOtp() { showToast('Email recovery requires a connected account provider. This account is stored only in this browser.'); }
function verifyForgotOtp() { sendForgotOtp(); }
function completePasswordReset() { sendForgotOtp(); }
function sendMagicLink() { showToast('Email access codes require a connected account provider. Please use your email and password.'); }
function verifyMagicCode() { sendMagicLink(); }


// ─── PILOT ACCOUNT & PASSWORD CHANGE ───
function populateAccountFields() {
  if (!currentUser) return;
  document.getElementById('acName').value = currentUser.name || '';
  document.getElementById('acLicense').value = currentUser.license || '';
  document.getElementById('acHomeBase').value = currentUser.homeBase || '';
  document.getElementById('acCurrentPw').value = '';
  document.getElementById('acNewPw').value = '';
}

async function savePilotProfile() {
  try {
    await authService.updateProfile({
      displayName: document.getElementById('acName').value.trim(),
      pilotLicense: document.getElementById('acLicense').value.trim(),
      homeBaseAirport: document.getElementById('acHomeBase').value.trim().toUpperCase(),
    });
    showToast('Pilot profile saved.');
    closeModal();
  } catch (error) { showToast(error.message); }
}
async function changeAccountPassword() {
  try {
    const password = document.getElementById('acNewPw').value;
    if (password.length < 8) throw new Error('New password must be at least 8 characters.');
    await authService.changePassword(document.getElementById('acCurrentPw').value, password);
    populateAccountFields();
    showToast('Master password changed successfully.');
  } catch (error) { showToast(error.message); }
}
async function performSignOut() {
  await authService.signOut();
  closeModal();
  showToast('Signed out.');
}
function enterCockpit() {
  if (!authService.isAuthenticated() || authService.getCurrentUser()?.isAnonymous) {
    openModal('signin');
    return;
  }
  window.location.assign('./index.html#navlog');
}


// ─── LEGAL MODAL ───
function openLegalModal(type) {
  savedPreviousPane = document.getElementById('paneRegister').classList.contains('active') ? 'register' : 'signin';
  const title = document.getElementById('legalTitle');
  title.textContent = type === 'privacy' ? 'Windlog Privacy Notice & Data Security' : 'Terms of Service & Aeronautical Disclaimer';
  switchPane('legal');
}

function closeLegalModal() {
  switchPane(savedPreviousPane);
}
Object.assign(window, { openModal, closeModal, handleBackdropClick, switchPane,
  togglePasswordVisibility, handleSignInSubmit, handleRegisterSubmit, evaluatePasswordStrength,
  handleGoogleAuth, saveGoogleClientId, sendForgotOtp, verifyForgotOtp, completePasswordReset,
  sendMagicLink, verifyMagicCode, resetMagicStep, savePilotProfile, changeAccountPassword,
  performSignOut, enterCockpit, openLegalModal, closeLegalModal });
