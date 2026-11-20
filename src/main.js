import './style.css';
import { db, isConfigured, syncOfflineData } from './db.js';
import { icons } from './icons.js';
import { state, fetchAllData, resetState } from './store.js';
import { switchView } from './views.js';
import { escapeHtml, showToast } from './utils.js';

const VALID_VIEWS = new Set(['dashboard', 'monthly', 'annual', 'settings']);
let isPasswordRecoveryMode = false;

function resolveViewFromHash() {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  return VALID_VIEWS.has(hash) ? hash : null;
}

function renderAppLoader(show) {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

// --- Password strength & HIBP helpers ---
function checkPasswordStrength(password) {
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { checks, score };
}

function renderPasswordStrengthMarkup() {
  return `
    <div id="password-strength-container" style="margin-top:8px;">
      <div id="password-strength-bar" style="height:4px;border-radius:2px;background:var(--border-color);overflow:hidden;margin-bottom:6px;">
        <div id="password-strength-fill" style="height:100%;width:0%;transition:width 0.3s,background 0.3s;"></div>
      </div>
      <div id="password-requirements" style="font-size:0.72rem;color:var(--text-muted);display:flex;flex-direction:column;gap:2px;">
        <span id="req-length" style="display:flex;align-items:center;gap:4px;">○ Min. 8 caratteri</span>
        <span id="req-upper" style="display:flex;align-items:center;gap:4px;">○ Almeno 1 maiuscola</span>
        <span id="req-number" style="display:flex;align-items:center;gap:4px;">○ Almeno 1 numero</span>
        <span id="req-special" style="display:flex;align-items:center;gap:4px;">○ Almeno 1 carattere speciale</span>
      </div>
    </div>
  `;
}

function updateStrengthBar(password) {
  const fill = document.getElementById('password-strength-fill');
  const reqLength = document.getElementById('req-length');
  const reqUpper = document.getElementById('req-upper');
  const reqNumber = document.getElementById('req-number');
  const reqSpecial = document.getElementById('req-special');
  if (!fill) return;

  const { checks, score } = checkPasswordStrength(password);
  const colors = ['#ff4d4d', '#ff8c42', '#f5c518', '#5bdb8a'];
  const labels = ['Molto debole', 'Debole', 'Buona', 'Forte'];
  const pct = score === 0 ? 0 : (score / 4) * 100;
  fill.style.width = pct + '%';
  fill.style.background = colors[Math.max(0, score - 1)] || colors[0];
  fill.title = labels[Math.max(0, score - 1)] || '';

  const mark = (ok) => ok ? '✓' : '○';
  const col = (ok) => ok ? 'color:#5bdb8a' : 'color:var(--text-muted)';
  if (reqLength) { reqLength.textContent = mark(checks.length) + ' Min. 8 caratteri'; reqLength.style.cssText = col(checks.length); }
  if (reqUpper) { reqUpper.textContent = mark(checks.upper) + ' Almeno 1 maiuscola'; reqUpper.style.cssText = col(checks.upper); }
  if (reqNumber) { reqNumber.textContent = mark(checks.number) + ' Almeno 1 numero'; reqNumber.style.cssText = col(checks.number); }
  if (reqSpecial) { reqSpecial.textContent = mark(checks.special) + ' Almeno 1 carattere speciale'; reqSpecial.style.cssText = col(checks.special); }
}

async function isPasswordPwned(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split('\n').some(line => line.split(':')[0].trim().toUpperCase() === suffix);
  } catch {
    return false;
  }
}

function showAuthMessage(text, type = 'error') {
  const el = document.getElementById('auth-message');
  if (!el) return;
  const styles = {
    error: 'background:rgba(220,53,69,0.12);border:1px solid rgba(220,53,69,0.3);color:#ff6b6b;',
    success: 'background:rgba(40,167,69,0.12);border:1px solid rgba(40,167,69,0.3);color:#5bdb8a;',
    info: 'background:rgba(197,168,128,0.12);border:1px solid rgba(197,168,128,0.3);color:var(--accent-gold);',
  };
  el.style.cssText = (styles[type] || styles.error) + 'display:block;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:0.82rem;line-height:1.4;';
  el.innerHTML = text;
}

function hideAuthMessage() {
  const el = document.getElementById('auth-message');
  if (el) el.style.display = 'none';
}

function renderPasswordRecoveryScreen() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-badge-luxury">${icons.lock('w-6 h-6')}</div>
          <h1 class="logo-title-luxury">FLUSSIO</h1>
          <p class="logo-subtitle-luxury">IMPOSTA NUOVA PASSWORD</p>
        </div>

        <form id="recovery-form">
          <div class="form-group">
            <label class="form-label" for="recovery-password">Nuova Password</label>
            <div class="input-container">
              ${icons.lock('input-icon')}
              <input class="input-field" type="password" id="recovery-password" required placeholder="••••••••" minlength="8" autofocus />
            </div>
            ${renderPasswordStrengthMarkup()}
          </div>

          <button type="submit" class="btn btn-primary mt-4" id="recovery-submit-btn">
            Salva Nuova Password
          </button>
        </form>

        <div id="auth-message" role="alert" style="display:none;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:0.82rem;line-height:1.4;"></div>
      </div>
    </div>
  `;

  const pwdInput = document.getElementById('recovery-password');
  pwdInput?.addEventListener('input', () => updateStrengthBar(pwdInput.value));

  document.getElementById('recovery-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthMessage();
    const newPassword = pwdInput.value;
    const { checks, score } = checkPasswordStrength(newPassword);
    if (score < 4) {
      const missing = [];
      if (!checks.length) missing.push('almeno 8 caratteri');
      if (!checks.upper) missing.push('una maiuscola');
      if (!checks.number) missing.push('un numero');
      if (!checks.special) missing.push('un carattere speciale');
      showAuthMessage(`⚠ Password non valida. Mancano: ${missing.join(', ')}.`);
      return;
    }

    const submitBtn = document.getElementById('recovery-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifica in corso...';

    try {
      showAuthMessage('🔍 Verifico la sicurezza della password...', 'info');
      const pwned = await isPasswordPwned(newPassword);
      if (pwned) {
        showAuthMessage('🚫 Questa password è stata trovata in un data breach noto (HaveIBeenPwned). Scegline un\'altra.');
        return;
      }

      const { error } = await db.auth.updatePassword(newPassword);
      if (error) {
        showAuthMessage('⚠ ' + escapeHtml(error.message));
        return;
      }

      isPasswordRecoveryMode = false;
      showToast('Password aggiornata con successo!', 'success');
      if (state.user) {
        await fetchAllData();
        initAppShell();
      } else {
        state.isAuthMode = 'login';
        initAppShell();
      }
    } finally {
      if (submitBtn && document.body.contains(submitBtn)) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salva Nuova Password';
      }
    }
  });
}

// Global Main Template Render (renders shell only once)
function initAppShell() {
  const app = document.getElementById('app');
  if (!app) return;

  if (isPasswordRecoveryMode) {
    renderPasswordRecoveryScreen();
    return;
  }

  if (!state.user) {
    const mode = state.isAuthMode; // 'login' | 'register' | 'forgot'
    const currentModeBtn = document.getElementById('auth-submit-btn')?.dataset.mode;
    if (document.querySelector('.auth-container') && currentModeBtn === mode) {
      return;
    }

    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="logo-badge-luxury">
              ${icons.wallet('w-6 h-6')}
            </div>
            <h1 class="logo-title-luxury">FLUSSIO</h1>
            <p class="logo-subtitle-luxury">PREMIUM PERSONAL FINANCE</p>
          </div>

          <form id="auth-form">
            <div class="form-group">
              <label class="form-label" for="auth-email">Email</label>
              <div class="input-container">
                ${icons.mail('input-icon')}
                <input class="input-field" type="email" id="auth-email" required placeholder="nome@esempio.it" />
              </div>
            </div>

            ${mode !== 'forgot' ? `
              <div class="form-group">
                <label class="form-label" for="auth-password">Password</label>
                <div class="input-container">
                  ${icons.lock('input-icon')}
                  <input class="input-field" type="password" id="auth-password" required placeholder="••••••••" minlength="8" />
                </div>
                ${mode === 'login' ? `
                  <div style="text-align:right;margin-top:6px;">
                    <button type="button" id="forgot-password-link" class="auth-inline-link">
                      Password dimenticata?
                    </button>
                  </div>
                ` : ''}
                ${mode === 'register' ? renderPasswordStrengthMarkup() : ''}
              </div>
            ` : ''}

            ${mode === 'register' ? `
              <label class="privacy-consent-row">
                <input type="checkbox" id="auth-privacy-checkbox" required />
                <span>Accetto l'<a href="https://www.cipo.dev/privacy" target="_blank" rel="noopener noreferrer">Informativa sulla Privacy</a></span>
              </label>
            ` : ''}

            <button type="submit" class="btn btn-primary mt-4" id="auth-submit-btn" data-mode="${mode}">
              ${mode === 'login' ? 'Accedi' : (mode === 'register' ? 'Registrati' : 'Invia link di recupero')}
            </button>
          </form>

          <div class="auth-toggle">
            ${mode === 'forgot'
              ? 'Ricordi la password? <span id="toggle-auth-mode">Torna al login</span>'
              : (mode === 'login'
                ? 'Non hai un account? <span id="toggle-auth-mode">Registrati</span>'
                : 'Hai già un account? <span id="toggle-auth-mode">Accedi</span>')}
          </div>

          <div style="text-align:center;margin-top:10px;font-size:0.75rem;">
            <a href="https://www.cipo.dev/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--text-muted);text-decoration:underline;">
              Informativa sulla Privacy
            </a>
          </div>

          <div id="auth-message" role="alert" style="display:none;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:0.82rem;line-height:1.4;"></div>

          ${!isConfigured ? `
            <div class="demo-badge-container text-center mt-6" style="margin-top: 1.5rem; text-align: center;">
              <span class="demo-badge" style="background: rgba(197, 168, 128, 0.15); color: var(--accent-gold); border-color: rgba(197, 168, 128, 0.3);">Modalità Locale Attiva</span>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                I parametri server non sono configurati. Le tue spese verranno salvate sul dispositivo corrente in modalità locale.
              </p>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    let rateLimitTimer = null;
    function showRateLimitMessage(seconds = 30) {
      if (rateLimitTimer) clearInterval(rateLimitTimer);
      let remaining = seconds;
      const update = () => {
        showAuthMessage(
          `⏱ Troppi tentativi. Riprova tra <strong>${remaining}s</strong>. <br><small>Supabase ha bloccato temporaneamente le richieste.</small>`,
          'error'
        );
      };
      update();
      rateLimitTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(rateLimitTimer);
          rateLimitTimer = null;
          hideAuthMessage();
        } else {
          update();
        }
      }, 1000);
    }

    function handleAuthError(error) {
      const msg = error?.message || '';
      const status = error?.status || 0;
      if (status === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many')) {
        showRateLimitMessage(30);
      } else {
        showAuthMessage('⚠ ' + escapeHtml(msg));
      }
    }

    const pwdInput = document.getElementById('auth-password');
    if (pwdInput && mode === 'register') {
      pwdInput.addEventListener('input', () => updateStrengthBar(pwdInput.value));
    }

    document.getElementById('forgot-password-link')?.addEventListener('click', () => {
      if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
      }
      state.isAuthMode = 'forgot';
      initAppShell();
    });

    document.getElementById('toggle-auth-mode')?.addEventListener('click', () => {
      if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
      }
      state.isAuthMode = mode === 'login' ? 'register' : 'login';
      initAppShell();
    });

    document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthMessage();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password')?.value || '';

      const submitBtn = document.getElementById('auth-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerText = mode === 'login'
        ? 'Accesso in corso...'
        : (mode === 'register' ? 'Registrazione in corso...' : 'Invio in corso...');

      try {
        if (mode === 'forgot') {
          const res = await db.auth.resetPasswordForEmail(email);
          if (res.error) {
            handleAuthError(res.error);
          } else {
            showAuthMessage(
              '📧 Se l\'indirizzo è registrato, riceverai un\'email con il link per reimpostare la password.',
              'success'
            );
          }
        } else if (mode === 'login') {
          const res = await db.auth.signIn(email, password);
          if (res.error) handleAuthError(res.error);
        } else {
          const privacyOk = document.getElementById('auth-privacy-checkbox')?.checked;
          if (!privacyOk) {
            showAuthMessage('⚠ Devi accettare l\'Informativa sulla Privacy per registrarti.');
            return;
          }

          const { checks, score } = checkPasswordStrength(password);
          if (score < 4) {
            const missing = [];
            if (!checks.length) missing.push('almeno 8 caratteri');
            if (!checks.upper) missing.push('una maiuscola');
            if (!checks.number) missing.push('un numero');
            if (!checks.special) missing.push('un carattere speciale');
            showAuthMessage(`⚠ Password non valida. Mancano: ${missing.join(', ')}.`);
            return;
          }

          showAuthMessage('🔍 Verifico la sicurezza della password...', 'info');
          const pwned = await isPasswordPwned(password);
          if (pwned) {
            showAuthMessage('🚫 Questa password è stata trovata in un data breach noto (HaveIBeenPwned). Scegli una password diversa.');
            return;
          }
          hideAuthMessage();

          const res = await db.auth.signUp(email, password);
          if (res.error) {
            handleAuthError(res.error);
          } else if (!res.data?.session) {
            showAuthMessage(
              '📧 <strong>Controlla la tua email!</strong><br>Ti abbiamo inviato un link di conferma a <em>' + escapeHtml(email) + '</em>. Clicca il link per attivare il tuo account.',
              'info'
            );
          }
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        const currentBtn = document.getElementById('auth-submit-btn');
        if (currentBtn) {
          currentBtn.disabled = false;
          currentBtn.innerText = mode === 'login' ? 'Accedi' : (mode === 'register' ? 'Registrati' : 'Invia link di recupero');
        }
      }
    });
  } else {
    const hashView = resolveViewFromHash();
    if (hashView) {
      state.activeView = hashView;
    }

    if (document.querySelector('.app-container')) {
      switchView(state.activeView);
      return;
    }

    app.innerHTML = `
      <div class="app-container">
        <!-- Sticky Header -->
        <header class="app-header">
          <div class="app-title-logo">
            ${icons.wallet('w-6 h-6')}
            <h2>Flussio</h2>
            ${!isConfigured ? '<span class="demo-badge" style="background: rgba(197, 168, 128, 0.15); color: var(--accent-gold); border-color: rgba(197, 168, 128, 0.3);">Modo Locale</span>' : ''}
          </div>
          <button id="header-logout-btn" class="action-icon" title="Esci" aria-label="Esci">
            ${icons.logout('w-5 h-5')}
          </button>
        </header>

        <!-- Views Container -->
        <main style="flex: 1; display: flex; flex-direction: column;">
          <div id="view-dashboard" class="view"></div>
          <div id="view-monthly" class="view"></div>
          <div id="view-annual" class="view"></div>
          <div id="view-settings" class="view"></div>
        </main>

        <!-- Bottom Navigation Bar -->
        <nav class="bottom-nav" aria-label="Navigazione principale">
          <button type="button" class="nav-item" data-view="dashboard">
            ${icons.wallet('w-6 h-6')}
            <span>Dashboard</span>
          </button>
          <button type="button" class="nav-item" data-view="monthly">
            ${icons.calendar('w-6 h-6')}
            <span>Mensili</span>
          </button>
          <button type="button" class="nav-item" data-view="annual">
            ${icons.checkCircle('w-6 h-6')}
            <span>Annuali</span>
          </button>
          <button type="button" class="nav-item" data-view="settings">
            ${icons.settings('w-6 h-6')}
            <span>Opzioni</span>
          </button>
        </nav>
      </div>

      <!-- General Modals Container -->
      <div id="modal-container"></div>
    `;

    document.getElementById('header-logout-btn').addEventListener('click', async () => {
      if (confirm('Sei sicuro di voler uscire?')) {
        await db.auth.signOut();
      }
    });

    document.querySelectorAll('.bottom-nav .nav-item').forEach(navBtn => {
      navBtn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        if (view) {
          window.location.hash = view;
          switchView(view);
        }
      });
    });

    switchView(state.activeView);
  }
}

// Register Service Worker for PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker registrato con successo. Scope:', reg.scope);

          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  if (confirm('Nuova versione di Flussio disponibile! Ricaricare la pagina per aggiornare?')) {
                    installingWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('Registrazione del Service Worker fallita:', err);
        });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

// Listen to auth state changes and prevent shell redrawing on minor events
let lastUserId = null;
let lastActiveDateStr = new Date().toISOString().slice(0, 10);

db.auth.onAuthStateChange(async (event, user) => {
  if (event === 'PASSWORD_RECOVERY') {
    isPasswordRecoveryMode = true;
    state.user = user;
    renderAppLoader(false);
    initAppShell();
    return;
  }

  const userChanged = !lastUserId || (user && user.id !== lastUserId);
  state.user = user;

  if (user) {
    lastUserId = user.id;
    lastActiveDateStr = new Date().toISOString().slice(0, 10);
    if (isPasswordRecoveryMode) {
      renderAppLoader(false);
      initAppShell();
      return;
    }
    if (userChanged) {
      renderAppLoader(true);
      await syncOfflineData(user.id);
      await fetchAllData();
      renderAppLoader(false);
      initAppShell();
    } else if (event !== 'TOKEN_REFRESHED') {
      fetchAllData().then(() => {
        switchView(state.activeView);
      });
    }
  } else {
    lastUserId = null;
    isPasswordRecoveryMode = false;
    resetState();
    renderAppLoader(false);
    initAppShell();
  }
});

// Support PWA manifest shortcuts and browser hash navigation
window.addEventListener('hashchange', () => {
  const hashView = resolveViewFromHash();
  if (hashView && state.user) {
    switchView(hashView);
  }
});

// Refetch data when tab becomes visible on a new day/month
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.user && !isPasswordRecoveryMode) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr !== lastActiveDateStr) {
      lastActiveDateStr = todayStr;
      const today = new Date();
      state.selectedMonth = today.getMonth() + 1;
      state.selectedYear = today.getFullYear();
      await fetchAllData();
      switchView(state.activeView);
    }
  }
});

// Refresh UI after background offline sync completes
window.addEventListener('flussio:synced', async () => {
  if (state.user) {
    await fetchAllData();
    switchView(state.activeView);
  }
});

// Register SW
registerServiceWorker();
