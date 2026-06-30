import './style.css';
import { db, isConfigured } from './db.js';
import { icons } from './icons.js';
import { state, fetchAllData } from './store.js';
import { switchView } from './views.js';

function renderAppLoader(show) {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

// Global Main Template Render (renders shell only once)
function initAppShell() {
  const app = document.getElementById('app');
  if (!app) return;
  
  if (!state.user) {
    // Avoid re-rendering if auth screen is already displayed with the correct mode
    const isAuthRendered = document.querySelector('.auth-container');
    const currentMode = document.getElementById('auth-submit-btn')?.innerText;
    const expectedModeText = state.isAuthMode === 'login' ? 'Accedi' : 'Registrati';
    
    if (isAuthRendered && currentMode === expectedModeText) {
      return;
    }

    // Render Auth screen
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
            
            <div class="form-group">
              <label class="form-label" for="auth-password">Password</label>
              <div class="input-container">
                ${icons.lock('input-icon')}
                <input class="input-field" type="password" id="auth-password" required placeholder="••••••••" minlength="8" />
              </div>
              ${state.isAuthMode === 'register' ? `
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
              ` : ''}
            </div>
            
            <button type="submit" class="btn btn-primary mt-4" id="auth-submit-btn">
              ${state.isAuthMode === 'login' ? 'Accedi' : 'Registrati'}
            </button>
          </form>
          
          <div class="auth-toggle">
            ${state.isAuthMode === 'login' 
              ? 'Non hai un account? <span id="toggle-auth-mode">Registrati</span>' 
              : 'Hai già un account? <span id="toggle-auth-mode">Accedi</span>'}
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
    
    // --- Helper: show inline message in auth card ---
    function showAuthMessage(text, type = 'error') {
      const el = document.getElementById('auth-message');
      if (!el) return;
      const styles = {
        error:   'background:rgba(220,53,69,0.12);border:1px solid rgba(220,53,69,0.3);color:#ff6b6b;',
        success: 'background:rgba(40,167,69,0.12);border:1px solid rgba(40,167,69,0.3);color:#5bdb8a;',
        info:    'background:rgba(197,168,128,0.12);border:1px solid rgba(197,168,128,0.3);color:var(--accent-gold);',
      };
      el.style.cssText = (styles[type] || styles.error) + 'display:block;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:0.82rem;line-height:1.4;';
      el.innerHTML = text;
    }
    function hideAuthMessage() {
      const el = document.getElementById('auth-message');
      if (el) el.style.display = 'none';
    }

    // --- Helper: password strength ---
    function checkPasswordStrength(password) {
      const checks = {
        length:  password.length >= 8,
        upper:   /[A-Z]/.test(password),
        number:  /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
      };
      const score = Object.values(checks).filter(Boolean).length;
      return { checks, score };
    }

    function updateStrengthBar(password) {
      const fill = document.getElementById('password-strength-fill');
      const reqLength  = document.getElementById('req-length');
      const reqUpper   = document.getElementById('req-upper');
      const reqNumber  = document.getElementById('req-number');
      const reqSpecial = document.getElementById('req-special');
      if (!fill) return;

      const { checks, score } = checkPasswordStrength(password);
      const colors = ['#ff4d4d','#ff8c42','#f5c518','#5bdb8a'];
      const labels = ['Molto debole','Debole','Buona','Forte'];
      const pct = score === 0 ? 0 : (score / 4) * 100;
      fill.style.width = pct + '%';
      fill.style.background = colors[Math.max(0, score - 1)] || colors[0];
      fill.title = labels[Math.max(0, score - 1)] || '';

      const mark = (ok) => ok ? '✓' : '○';
      const col  = (ok) => ok ? 'color:#5bdb8a' : 'color:var(--text-muted)';
      if (reqLength)  { reqLength.textContent  = mark(checks.length)  + ' Min. 8 caratteri';         reqLength.style.cssText  = col(checks.length); }
      if (reqUpper)   { reqUpper.textContent   = mark(checks.upper)   + ' Almeno 1 maiuscola';        reqUpper.style.cssText   = col(checks.upper); }
      if (reqNumber)  { reqNumber.textContent  = mark(checks.number)  + ' Almeno 1 numero';           reqNumber.style.cssText  = col(checks.number); }
      if (reqSpecial) { reqSpecial.textContent = mark(checks.special) + ' Almeno 1 carattere speciale'; reqSpecial.style.cssText = col(checks.special); }
    }

    // --- Helper: HIBP k-anonymity check ---
    async function isPasswordPwned(password) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password.toUpperCase());
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const prefix = hashHex.slice(0, 5);
        const suffix = hashHex.slice(5);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true' }
        });
        if (!res.ok) return false; // If HIBP is unreachable, don't block the user
        const text = await res.text();
        const lines = text.split('\n');
        return lines.some(line => line.split(':')[0].trim().toUpperCase() === suffix);
      } catch {
        return false; // Never block on HIBP failure
      }
    }

    // --- Helper: rate-limit countdown ---
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
        showAuthMessage('⚠ ' + msg);
      }
    }

    // Live strength bar on password input
    const pwdInput = document.getElementById('auth-password');
    if (pwdInput && state.isAuthMode === 'register') {
      pwdInput.addEventListener('input', () => updateStrengthBar(pwdInput.value));
    }

    // Auth Event Listeners
    document.getElementById('toggle-auth-mode').addEventListener('click', () => {
      state.isAuthMode = state.isAuthMode === 'login' ? 'register' : 'login';
      initAppShell();
    });
    
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthMessage();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      
      const submitBtn = document.getElementById('auth-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerText = state.isAuthMode === 'login' ? 'Accesso in corso...' : 'Registrazione in corso...';
      
      try {
        if (state.isAuthMode === 'login') {
          const res = await db.auth.signIn(email, password);
          if (res.error) handleAuthError(res.error);
        } else {
          // P5: validate strength before submitting
          // Supabase requires all 4: length >= 8, uppercase, number, special char
          const { checks, score } = checkPasswordStrength(password);
          if (score < 4) {
            const missing = [];
            if (!checks.length)  missing.push('almeno 8 caratteri');
            if (!checks.upper)   missing.push('una maiuscola');
            if (!checks.number)  missing.push('un numero');
            if (!checks.special) missing.push('un carattere speciale');
            showAuthMessage(`⚠ Password non valida. Mancano: ${missing.join(', ')}.`);
            submitBtn.disabled = false;
            submitBtn.innerText = 'Registrati';
            return;
          }

          // P5: HIBP check
          showAuthMessage('🔍 Verifico la sicurezza della password...', 'info');
          const pwned = await isPasswordPwned(password);
          if (pwned) {
            showAuthMessage('🚫 Questa password è stata trovata in un data breach noto (HaveIBeenPwned). Scegli una password diversa.');
            submitBtn.disabled = false;
            submitBtn.innerText = 'Registrati';
            return;
          }
          hideAuthMessage();

          const res = await db.auth.signUp(email, password);
          if (res.error) {
            handleAuthError(res.error);
          } else if (!res.data?.session) {
            // P3: email confirmation required – session is null
            showAuthMessage(
              '📧 <strong>Controlla la tua email!</strong><br>Ti abbiamo inviato un link di conferma a <em>' + email + '</em>. Clicca il link per attivare il tuo account.',
              'info'
            );
          }
          // If session is present (email confirm disabled), onAuthStateChange will fire and load the app
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = state.isAuthMode === 'login' ? 'Accedi' : 'Registrati';
      }
    });
    
  } else {
    // Avoid re-rendering shell if it's already mounted
    if (document.querySelector('.app-container')) {
      return;
    }

    // Render Authenticated App Shell
    app.innerHTML = `
      <div class="app-container">
        <!-- Sticky Header -->
        <header class="app-header">
          <div class="app-title-logo">
            ${icons.wallet('w-6 h-6')}
            <h2>Flussio</h2>
            ${!isConfigured ? '<span class="demo-badge" style="background: rgba(197, 168, 128, 0.15); color: var(--accent-gold); border-color: rgba(197, 168, 128, 0.3);">Modo Locale</span>' : ''}
          </div>
          <button id="header-logout-btn" class="action-icon" title="Esci">
            ${icons.logout('w-5 h-5')}
          </button>
        </header>

        <!-- Views Container -->
        <main style="flex: 1; display: flex; flex-direction: column;">
          <!-- View 1: Dashboard -->
          <div id="view-dashboard" class="view"></div>
          
          <!-- View 2: Spese Mensili -->
          <div id="view-monthly" class="view"></div>
          
          <!-- View 3: Spese Annuali -->
          <div id="view-annual" class="view"></div>
          
          <!-- View 4: Impostazioni -->
          <div id="view-settings" class="view"></div>
        </main>

        <!-- Bottom Navigation Bar -->
        <nav class="bottom-nav">
          <a class="nav-item" data-view="dashboard">
            ${icons.wallet('w-6 h-6')}
            <span>Dashboard</span>
          </a>
          <a class="nav-item" data-view="monthly">
            ${icons.calendar('w-6 h-6')}
            <span>Mensili</span>
          </a>
          <a class="nav-item" data-view="annual">
            ${icons.checkCircle('w-6 h-6')}
            <span>Annuali</span>
          </a>
          <a class="nav-item" data-view="settings">
            ${icons.settings('w-6 h-6')}
            <span>Opzioni</span>
          </a>
        </nav>
      </div>

      <!-- General Modals Container -->
      <div id="modal-container"></div>
    `;
    
    // Global Event Listeners
    document.getElementById('header-logout-btn').addEventListener('click', async () => {
      if (confirm('Sei sicuro di voler uscire?')) {
        await db.auth.signOut();
      }
    });
    
    document.querySelectorAll('.bottom-nav .nav-item').forEach(navLink => {
      navLink.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        switchView(view);
      });
    });
    
    // Switch to active view
    switchView(state.activeView);
  }
}

// Register Service Worker for PWA (Only in Production / if supported)
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker registrato con successo. Scope:', reg.scope);
          
          // Detect service worker updates and prompt reload
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    if (confirm('Nuova versione di Flussio disponibile! Ricaricare la pagina per aggiornare?')) {
                      window.location.reload();
                    }
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

    // Reload page when the active service worker changes
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

db.auth.onAuthStateChange(async (event, user) => {
  const userChanged = !lastUserId || (user && user.id !== lastUserId);
  state.user = user;
  
  if (user) {
    lastUserId = user.id;
    if (userChanged) {
      renderAppLoader(true);
      await fetchAllData();
      renderAppLoader(false);
      initAppShell();
    } else if (event !== 'TOKEN_REFRESHED') {
      // Silent updates for minor events
      fetchAllData().then(() => {
        switchView(state.activeView);
      });
    }
  } else {
    lastUserId = null;
    state.isLoading = false;
    renderAppLoader(false);
    initAppShell();
  }
});

// Register SW
registerServiceWorker();
