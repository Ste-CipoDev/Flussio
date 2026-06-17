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
    // Render Auth screen
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-logo">
            ${icons.wallet('w-12 h-12 mx-auto')}
            <h1>Flussio</h1>
            <p>Gestisci le tue spese con stile</p>
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
                <input class="input-field" type="password" id="auth-password" required placeholder="••••••••" minlength="6" />
              </div>
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
          
          ${!isConfigured ? `
            <div class="demo-badge-container text-center mt-6" style="margin-top: 1.5rem; text-align: center;">
              <span class="demo-badge" style="background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border-color: rgba(239, 68, 68, 0.4);">Errore di Configurazione</span>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                Le chiavi del server non sono configurate. Contatta l'amministratore o verifica le variabili d'ambiente.
              </p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // Auth Event Listeners
    document.getElementById('toggle-auth-mode').addEventListener('click', () => {
      state.isAuthMode = state.isAuthMode === 'login' ? 'register' : 'login';
      initAppShell();
    });
    
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      
      const submitBtn = document.getElementById('auth-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerText = state.isAuthMode === 'login' ? 'Accesso in corso...' : 'Registrazione in corso...';
      
      try {
        if (state.isAuthMode === 'login') {
          const { error } = await db.auth.signIn(email, password);
          if (error) alert(`Errore: ${error.message}`);
        } else {
          const { error } = await db.auth.signUp(email, password);
          if (error) alert(`Errore: ${error.message}`);
          else alert('Registrazione completata! Ora puoi accedere.');
        }
      } catch (err) {
        alert(`Errore: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = state.isAuthMode === 'login' ? 'Accedi' : 'Registrati';
      }
    });
    
  } else {
    // Render Authenticated App Shell
    app.innerHTML = `
      <div class="app-container">
        <!-- Sticky Header -->
        <header class="app-header">
          <div class="app-title-logo">
            ${icons.wallet('w-6 h-6')}
            <h2>Flussio</h2>
            ${!isConfigured ? '<span class="demo-badge" style="background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border-color: rgba(239, 68, 68, 0.4);">Non Connesso</span>' : ''}
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
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registrato con successo. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('Registrazione del Service Worker fallita:', err);
        });
    });
  }
}

// Listen to auth state changes
db.auth.onAuthStateChange(async (event, user) => {
  state.user = user;
  if (user) {
    renderAppLoader(true);
    await fetchAllData();
    renderAppLoader(false);
  } else {
    state.isLoading = false;
    renderAppLoader(false);
  }
  initAppShell();
});

// Register SW
registerServiceWorker();
