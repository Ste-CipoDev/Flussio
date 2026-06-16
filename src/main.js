import './style.css';
import { db, isConfigured } from './db.js';
import { icons } from './icons.js';

// State management
let state = {
  user: null,
  profile: { salary_day: 27, current_balance: 0 },
  monthlyCommitments: [],
  annualCommitments: [],
  annualStatus: [],
  plannedExpenses: [],
  activeView: 'dashboard', // dashboard, monthly, annual, settings
  isLoading: true,
  isAuthMode: 'login' // login, register
};

// Database error helper
function checkError(result, actionName) {
  if (result && result.error) {
    console.error(`Error during ${actionName}:`, result.error);
    alert(`Errore (${actionName}): ${result.error.message || JSON.stringify(result.error)}`);
    return false;
  }
  return true;
}

// ==========================================
// Date & Calculation Helpers
// ==========================================

// Returns the date of the next salary
function getNextSalaryDate(salaryDay) {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-11
  
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  
  let targetDay = Math.min(salaryDay, getDaysInMonth(year, month));
  let salaryDateThisMonth = new Date(year, month, targetDay, 0, 0, 0);
  
  if (today < salaryDateThisMonth) {
    return salaryDateThisMonth;
  } else {
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    targetDay = Math.min(salaryDay, getDaysInMonth(year, month));
    return new Date(year, month, targetDay, 0, 0, 0);
  }
}

// Determines if a monthly expense day falls between today and the day before the next salary
function isExpenseRemaining(expenseDay, salaryDay) {
  const today = new Date();
  const nextSalary = getNextSalaryDate(salaryDay);
  
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  
  // Start of today (00:00:00) to ignore times in comparisons
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  
  // 1. Check current month occurrence
  let year = today.getFullYear();
  let month = today.getMonth();
  let targetDay = Math.min(expenseDay, getDaysInMonth(year, month));
  let expenseDateCurrentMonth = new Date(year, month, targetDay, 0, 0, 0);
  
  // 2. Check next month occurrence
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }
  let nextTargetDay = Math.min(expenseDay, getDaysInMonth(nextYear, nextMonth));
  let expenseDateNextMonth = new Date(nextYear, nextMonth, nextTargetDay, 0, 0, 0);
  
  const isCurrentMonthRemaining = (expenseDateCurrentMonth >= todayStart && expenseDateCurrentMonth < nextSalary);
  const isNextMonthRemaining = (expenseDateNextMonth >= todayStart && expenseDateNextMonth < nextSalary);
  
  return isCurrentMonthRemaining || isNextMonthRemaining;
}

// Formats a date into DD/MM/YYYY
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Formats currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

// Returns the Italian name of the month
function getMonthName(monthNum) {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[monthNum - 1];
}

// ==========================================
// Core Calculations
// ==========================================

function calculateMetrics() {
  const residuo = parseFloat(state.profile.current_balance || 0);
  
  // 1. Spese Rimanenti
  const speseRimanenti = state.monthlyCommitments
    .filter(item => isExpenseRemaining(item.day, state.profile.salary_day))
    .reduce((sum, item) => sum + parseFloat(item.amount), 0);
  
  // 2. Residuo Mese
  const residuoMese = residuo - speseRimanenti;
  
  // 3. Altre Spese in Programma (Planned)
  const altreSpese = state.plannedExpenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  
  // 4. Rimanenza Mensile
  const rimanenzaMensile = residuoMese - altreSpese;
  
  return {
    residuo,
    speseRimanenti,
    residuoMese,
    altreSpese,
    rimanenzaMensile
  };
}

// ==========================================
// Navigation & Views
// ==========================================

function switchView(viewName) {
  state.activeView = viewName;
  
  // Update view visibility in DOM
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`view-${viewName}`);
  if (activeEl) activeEl.classList.add('active');
  
  // Update active class in navigation
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (navEl) navEl.classList.add('active');

  // Trigger specific view loads
  if (viewName === 'dashboard') {
    renderDashboard();
  } else if (viewName === 'monthly') {
    renderMonthly();
  } else if (viewName === 'annual') {
    renderAnnual();
  } else if (viewName === 'settings') {
    renderSettings();
  }
}

// ==========================================
// Fetching Data
// ==========================================

async function fetchAllData() {
  if (!state.user) return;
  state.isLoading = true;
  renderAppLoader(true);
  
  try {
    const userId = state.user.id;
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();
    
    // Fetch profile (salary settings & current balance)
    const profile = await db.profile.get(userId);
    state.profile = profile || { salary_day: 27, current_balance: 0 };
    
    // Fetch monthly commitments
    const { data: monthly } = await db.monthly.list(userId);
    state.monthlyCommitments = monthly;
    
    // Fetch annual commitments
    const { data: annual } = await db.annual.list(userId);
    state.annualCommitments = annual;
    
    // Fetch annual payments status for current year
    const { data: annualStatus } = await db.annualStatus.list(userId, currentYear);
    state.annualStatus = annualStatus;
    
    // Fetch planned expenses for current month
    const { data: planned } = await db.planned.list(userId, currentMonth, currentYear);
    state.plannedExpenses = planned;
    
  } catch (err) {
    console.error('Error fetching data:', err);
  } finally {
    state.isLoading = false;
    renderAppLoader(false);
  }
}

// ==========================================
// DOM Rendering Functions
// ==========================================

// Shared import helper
async function executeImport(data) {
  const userId = state.user.id;
  try {
    // 1. Update Profile
    if (data.profile) {
      const res = await db.profile.update(userId, {
        salary_day: data.profile.salary_day,
        current_balance: data.profile.current_balance
      });
      if (!checkError(res, "importazione profilo")) return false;
    }

    // 2. Clear & Import Monthly Commitments
    const { data: currentMonthly, error: listMonthlyErr } = await db.monthly.list(userId);
    if (!listMonthlyErr) {
      for (const item of currentMonthly) {
        await db.monthly.delete(userId, item.id);
      }
    }
    if (data.monthlyCommitments) {
      for (const item of data.monthlyCommitments) {
        const res = await db.monthly.insert(userId, { name: item.name, day: item.day, amount: item.amount });
        if (!checkError(res, "importazione spesa mensile")) return false;
      }
    }

    // 3. Clear & Import Annual Commitments
    const { data: currentAnnual, error: listAnnualErr } = await db.annual.list(userId);
    if (!listAnnualErr) {
      for (const item of currentAnnual) {
        await db.annual.delete(userId, item.id);
      }
    }
    if (data.annualCommitments) {
      for (const item of data.annualCommitments) {
        const res = await db.annual.insert(userId, { name: item.name, month: item.month, amount: item.amount });
        if (!checkError(res, "importazione spesa annuale")) return false;
      }
    }

    // 4. Clear & Import Planned Expenses
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const { data: currentPlanned, error: listPlannedErr } = await db.planned.list(userId, currentMonth, currentYear);
    if (!listPlannedErr) {
      for (const item of currentPlanned) {
        await db.planned.delete(userId, item.id);
      }
    }
    if (data.plannedExpenses) {
      for (const item of data.plannedExpenses) {
        const res = await db.planned.insert(userId, {
          name: item.name,
          amount: item.amount,
          month: currentMonth,
          year: currentYear
        });
        if (!checkError(res, "importazione spesa variabile")) return false;
      }
    }
    return true;
  } catch (err) {
    alert('Errore imprevisto durante l\'importazione: ' + err.message);
    return false;
  }
}

function renderAppLoader(show) {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

// Global Main Template Render (renders shell only once)
function initAppShell() {
  const app = document.getElementById('app');
  
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

// Render Dashboard View
function renderDashboard() {
  const metrics = calculateMetrics();
  const nextSalaryDate = getNextSalaryDate(state.profile.salary_day);
  const container = document.getElementById('view-dashboard');
  
  container.innerHTML = `
    <!-- Metrics Cards Grid -->
    <div class="summary-grid">
      <!-- Residuo Attuale -->
      <div class="metric-card primary">
        <span class="metric-label">Residuo Iniziale</span>
        <div class="metric-value-row">
          <span class="metric-value">${formatCurrency(metrics.residuo)}</span>
          <button id="edit-residuo-btn" class="metric-action-btn" title="Modifica saldo attuale">
            ${icons.edit('w-5 h-5')}
          </button>
        </div>
        <div class="metric-details">
          <span>Ultimo aggiornamento sul conto</span>
        </div>
      </div>

      <!-- Spese Rimanenti -->
      <div class="metric-card warning">
        <span class="metric-label">Spese Fisse Rimanenti</span>
        <div class="metric-value-row">
          <span class="metric-value">${formatCurrency(metrics.speseRimanenti)}</span>
        </div>
        <div class="metric-details">
          <span>Fino al prossimo stipendio (${formatDate(nextSalaryDate)})</span>
        </div>
      </div>

      <!-- Residuo Mese -->
      <div class="metric-card">
        <span class="metric-label">Residuo Mese</span>
        <div class="metric-value-row">
          <span class="metric-value" style="color: ${metrics.residuoMese >= 0 ? 'var(--text-primary)' : 'var(--accent-red)'}">
            ${formatCurrency(metrics.residuoMese)}
          </span>
        </div>
        <div class="metric-details">
          <span>Residuo - Spese Fisse Rimanenti</span>
        </div>
      </div>

      <!-- Altre Spese / Budget -->
      <div class="metric-card">
        <span class="metric-label">Budget Spese Variabili</span>
        <div class="metric-value-row">
          <span class="metric-value" style="color: var(--text-secondary)">${formatCurrency(metrics.altreSpese)}</span>
        </div>
        <div class="metric-details">
          <span>Groceries, Benzina, ecc. programmate</span>
        </div>
      </div>

      <!-- Rimanenza Mensile -->
      <div class="metric-card success">
        <span class="metric-label">Rimanenza Mensile Libera</span>
        <div class="metric-value-row">
          <span class="metric-value" style="color: ${metrics.rimanenzaMensile >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
            ${formatCurrency(metrics.rimanenzaMensile)}
          </span>
        </div>
        <div class="metric-details">
          <span>Soldi effettivamente liberi</span>
        </div>
      </div>
    </div>

    <!-- Planned Expenses Section -->
    <div class="section-header">
      <h3>Spese Variabili Programmate</h3>
      <button id="add-planned-btn" class="add-btn">
        ${icons.plus('w-4 h-4')} Aggiungi
      </button>
    </div>

    <div class="card-list" id="planned-expenses-list">
      <!-- Will be rendered dynamically -->
    </div>
  `;

  // Render planned list
  const listContainer = document.getElementById('planned-expenses-list');
  if (state.plannedExpenses.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessuna spesa variabile programmata per questo mese.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = state.plannedExpenses.map(item => `
      <div class="item-card">
        <div class="item-info">
          <span class="item-title">${item.name}</span>
          <span class="item-subtitle">Spesa programmata</span>
        </div>
        <div class="item-right">
          <span class="item-amount">${formatCurrency(item.amount)}</span>
          <button class="action-icon delete-btn" data-id="${item.id}" title="Elimina">
            ${icons.trash('w-4 h-4')}
          </button>
        </div>
      </div>
    `).join('');
    
    // Attach delete listeners
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Eliminare questa spesa programmata?')) {
          const res = await db.planned.delete(state.user.id, id);
          if (checkError(res, "eliminazione spesa variabile")) {
            await fetchAllData();
            renderDashboard();
          }
        }
      });
    });
  }

  // Edit balance click
  document.getElementById('edit-residuo-btn').addEventListener('click', () => {
    showEditResiduoModal();
  });

  // Add planned expense click
  document.getElementById('add-planned-btn').addEventListener('click', () => {
    showAddPlannedModal();
  });
}

// Render Monthly Commitments View
function renderMonthly() {
  const container = document.getElementById('view-monthly');
  const totalMonthly = state.monthlyCommitments.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  
  container.innerHTML = `
    <div class="section-header">
      <h3>Spese Mensili Fisse</h3>
      <button id="add-monthly-btn" class="add-btn">
        ${icons.plus('w-4 h-4')} Aggiungi
      </button>
    </div>

    <div class="metric-card mb-4" style="margin-bottom: 1rem;">
      <span class="metric-label">Totale Uscite Fisse</span>
      <div class="metric-value-row">
        <span class="metric-value" style="font-size: 1.75rem; color: var(--accent-gold);">${formatCurrency(totalMonthly)}</span>
      </div>
      <div class="metric-details">
        <span>Spese ricorrenti addebitate ogni mese</span>
      </div>
    </div>

    <div class="card-list" id="monthly-commitments-list">
      <!-- Will be rendered dynamically -->
    </div>
  `;

  const listContainer = document.getElementById('monthly-commitments-list');
  if (state.monthlyCommitments.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessun impegno mensile inserito. Clicca "Aggiungi" per iniziare.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = state.monthlyCommitments.map(item => {
      const isRemaining = isExpenseRemaining(item.day, state.profile.salary_day);
      return `
        <div class="item-card ${isRemaining ? 'remaining-highlight' : ''}">
          <div class="item-info">
            <span class="item-title">${item.name}</span>
            <span class="item-subtitle">Giorno di addebito: <strong>${item.day}</strong>
              ${isRemaining 
                ? '<span class="item-badge unpaid">Da Pagare</span>' 
                : '<span class="item-badge paid">Passata/Pagata</span>'}
            </span>
          </div>
          <div class="item-right">
            <span class="item-amount">${formatCurrency(item.amount)}</span>
            <button class="action-icon delete-btn" data-id="${item.id}" title="Elimina">
              ${icons.trash('w-4 h-4')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach delete listeners
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Sei sicuro di voler eliminare questa spesa fissa?')) {
          const res = await db.monthly.delete(state.user.id, id);
          if (checkError(res, "eliminazione spesa fissa")) {
            await fetchAllData();
            renderMonthly();
          }
        }
      });
    });
  }

  // Add monthly commitment click
  document.getElementById('add-monthly-btn').addEventListener('click', () => {
    showAddMonthlyModal();
  });
}

// Render Annual Commitments View
function renderAnnual() {
  const container = document.getElementById('view-annual');
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();
  
  container.innerHTML = `
    <div class="section-header">
      <h3>Spese Annuali</h3>
      <button id="add-annual-btn" class="add-btn">
        ${icons.plus('w-4 h-4')} Aggiungi
      </button>
    </div>

    <div class="info-banner">
      ${icons.info('w-5 h-5')}
      <div class="info-banner-content">
        <span class="info-banner-title">Come funzionano?</span>
        <span>Le spese annuali compaiono in rosso durante il mese di scadenza per avvisarti. Clicca sul cerchio per confermare il pagamento. Non influiscono sui calcoli mensili.</span>
      </div>
    </div>

    <div class="card-list" id="annual-commitments-list">
      <!-- Will be rendered dynamically -->
    </div>
  `;

  const listContainer = document.getElementById('annual-commitments-list');
  if (state.annualCommitments.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessun impegno annuale inserito. Clicca "Aggiungi" per iniziare.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = state.annualCommitments.map(item => {
      const isDueThisMonth = item.month === currentMonth;
      const isConfirmed = state.annualStatus.some(s => s.annual_commitment_id === item.id);
      
      let borderStyle = '';
      let badgeHtml = '';
      let checkActionClass = '';
      
      if (isDueThisMonth) {
        if (isConfirmed) {
          borderStyle = 'border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.05);';
          badgeHtml = '<span class="item-badge paid">Pagato</span>';
          checkActionClass = 'confirmed';
        } else {
          borderStyle = 'border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05);';
          badgeHtml = '<span class="item-badge unpaid">Scadenza Questo Mese!</span>';
        }
      }

      return `
        <div class="item-card" style="${borderStyle}">
          <div class="item-info">
            <span class="item-title">${item.name}</span>
            <span class="item-subtitle">Mese di addebito: <strong>${getMonthName(item.month)}</strong> ${badgeHtml}</span>
          </div>
          <div class="item-right">
            <span class="item-amount">${formatCurrency(item.amount)}</span>
            
            ${isDueThisMonth ? `
              <button class="action-icon confirm-btn ${checkActionClass}" data-id="${item.id}" data-confirmed="${isConfirmed}" title="${isConfirmed ? 'Annulla Pagamento' : 'Conferma Pagamento'}">
                ${icons.checkCircle('w-5 h-5')}
              </button>
            ` : ''}

            <button class="action-icon delete-btn" data-id="${item.id}" title="Elimina">
              ${icons.trash('w-4 h-4')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners for payment confirmations
    listContainer.querySelectorAll('.confirm-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const isConfirmed = e.currentTarget.getAttribute('data-confirmed') === 'true';
        
        let res;
        if (isConfirmed) {
          res = await db.annualStatus.unconfirm(state.user.id, id, currentYear);
        } else {
          res = await db.annualStatus.confirm(state.user.id, id, currentYear);
        }
        if (checkError(res, "conferma pagamento annuale")) {
          await fetchAllData();
          renderAnnual();
        }
      });
    });

    // Attach delete listeners
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Sei sicuro di voler eliminare questa spesa annuale?')) {
          const res = await db.annual.delete(state.user.id, id);
          if (checkError(res, "eliminazione spesa annuale")) {
            await fetchAllData();
            renderAnnual();
          }
        }
      });
    });
  }

  // Add annual commitment click
  document.getElementById('add-annual-btn').addEventListener('click', () => {
    showAddAnnualModal();
  });
}

// Render Settings View
function renderSettings() {
  const container = document.getElementById('view-settings');
  const nextSalaryDate = getNextSalaryDate(state.profile.salary_day);
  
  container.innerHTML = `
    <div class="section-header">
      <h3>Opzioni & Profilo</h3>
    </div>

    <div class="settings-list">
      <!-- Account Info -->
      <div class="settings-item">
        <div class="settings-item-left">
          ${icons.user('w-5 h-5')}
          <span class="settings-item-title">Account</span>
        </div>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">${state.user.email}</span>
      </div>

      <!-- Salary Day Settings -->
      <div class="settings-item">
        <div class="settings-item-left">
          ${icons.calendar('w-5 h-5')}
          <span class="settings-item-title">Giorno dello Stipendio</span>
        </div>
        <div class="settings-action">
          <input type="number" id="settings-salary-day" min="1" max="31" value="${state.profile.salary_day}" />
        </div>
      </div>

      <!-- Next Salary Info -->
      <div class="settings-item">
        <div class="settings-item-left">
          ${icons.info('w-5 h-5')}
          <span class="settings-item-title">Prossimo Stipendio</span>
        </div>
        <span style="font-size: 0.85rem; color: var(--accent-gold); font-weight: 500;">
          ${formatDate(nextSalaryDate)}
        </span>
      </div>

      <!-- Cloud Configuration status -->
      <div class="settings-item">
        <div class="settings-item-left">
          ${icons.database('w-5 h-5')}
          <span class="settings-item-title">Sincronizzazione Cloud</span>
        </div>
        <span style="font-size: 0.85rem; color: ${isConfigured ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight: 500;">
          ${isConfigured ? 'Attiva' : 'Non Attiva'}
        </span>
      </div>
    </div>

    <!-- Backup section for local backup/import (perfect for local mode) -->
    <div class="section-header">
      <h3>Backup Dati</h3>
    </div>

    <div class="settings-list">
      <div class="settings-item" id="export-backup-btn" style="cursor: pointer;">
        <div class="settings-item-left">
          ${icons.download('w-5 h-5')}
          <span class="settings-item-title">Esporta Backup (JSON)</span>
        </div>
        <span style="font-size: 0.85rem; color: var(--text-muted);">${icons.plus('w-4 h-4 transform rotate-45')}</span>
      </div>
      
      <div class="settings-item" style="position: relative; cursor: pointer;">
        <div class="settings-item-left">
          ${icons.upload('w-5 h-5')}
          <span class="settings-item-title">Importa da File (JSON)</span>
        </div>
        <input type="file" id="import-backup-file" accept="application/json, .json" style="position: absolute; inset: 0; opacity: 0; cursor: pointer;" />
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem;">
      <button id="logout-btn" class="btn btn-secondary" style="color: var(--text-primary);">
        ${icons.logout('w-5 h-5')} Disconnetti Account
      </button>
      <button id="delete-account-btn" class="btn btn-secondary" style="color: var(--accent-red); border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05);">
        ${icons.trash('w-5 h-5')} Elimina Account e Dati
      </button>
    </div>
  `;

  // Attach change listener to salary day
  const salaryInput = document.getElementById('settings-salary-day');
  salaryInput.addEventListener('change', async (e) => {
    let day = parseInt(e.target.value);
    if (isNaN(day) || day < 1) day = 1;
    if (day > 31) day = 31;
    e.target.value = day;
    
    const res = await db.profile.update(state.user.id, { salary_day: day });
    if (checkError(res, "salvataggio giorno stipendio")) {
      await fetchAllData();
      renderSettings();
    }
  });

  // Attach logout listener
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (confirm('Sei sicuro di voler uscire?')) {
      await db.auth.signOut();
    }
  });

  // Attach delete account listener
  document.getElementById('delete-account-btn').addEventListener('click', async () => {
    const confirm1 = confirm("ATTENZIONE: Questa azione è irreversibile. Verranno eliminati definitivamente il tuo account e TUTTI i dati associati.\n\nSei sicuro di voler procedere?");
    if (confirm1) {
      const confirm2 = confirm("SEI ASSOLUTAMENTE SICURO?\nTutti i tuoi dati mensili, annuali e il tuo profilo verranno eliminati per sempre dal server.");
      if (confirm2) {
        renderAppLoader(true);
        const res = await db.auth.deleteAccount();
        renderAppLoader(false);
        if (res.error) {
          alert(`Errore durante l'eliminazione dell'account: ${res.error.message || JSON.stringify(res.error)}`);
        } else {
          alert("Account eliminato con successo. Verrai reindirizzato alla schermata di accesso.");
        }
      }
    }
  });

  // Export backup
  document.getElementById('export-backup-btn').addEventListener('click', () => {
    const backupData = {
      profile: state.profile,
      monthlyCommitments: state.monthlyCommitments,
      annualCommitments: state.annualCommitments,
      plannedExpenses: state.plannedExpenses
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `flussio_backup_${formatDate(new Date()).replace(/\//g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Import backup from file
  document.getElementById('import-backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (confirm('L\'importazione sovrascriverà tutti i dati correnti. Continuare?')) {
          renderAppLoader(true);
          const success = await executeImport(data);
          renderAppLoader(false);
          if (success) {
            alert('Importazione completata con successo!');
            await fetchAllData();
            switchView('dashboard'); // Redirect to dashboard to see results!
          }
        }
      } catch (err) {
        alert('Errore durante l\'importazione: il file JSON non è valido.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  });
}

// ==========================================
// Modal Handlers
// ==========================================

function closeModal() {
  const modal = document.getElementById('modal-overlay-el');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      document.getElementById('modal-container').innerHTML = '';
    }, 200);
  }
}

function renderModalHTML(title, formHTML) {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay active" id="modal-overlay-el">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close-btn">${icons.plus('w-6 h-6 transform rotate-45')}</button>
        </div>
        ${formHTML}
      </div>
    </div>
  `;

  // Attach close events
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-overlay-el').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay-el') closeModal();
  });
}

// Modal: Update Residuo (Current balance)
function showEditResiduoModal() {
  const formHTML = `
    <form id="edit-residuo-form">
      <div class="form-group">
        <label class="form-label" for="residuo-val">Nuovo Residuo Conto (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="number" step="0.01" id="residuo-val" value="${state.profile.current_balance}" required autofocus />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Annulla</button>
        <button type="submit" class="btn btn-primary">Salva</button>
      </div>
    </form>
  `;
  
  renderModalHTML('Aggiorna Residuo', formHTML);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  
  document.getElementById('edit-residuo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseFloat(document.getElementById('residuo-val').value);
    
    const res = await db.profile.update(state.user.id, { current_balance: val });
    if (checkError(res, "salvataggio residuo")) {
      await fetchAllData();
      closeModal();
      renderDashboard();
    }
  });
}

// Modal: Add Planned Expense
function showAddPlannedModal() {
  const formHTML = `
    <form id="add-planned-form">
      <div class="form-group">
        <label class="form-label" for="planned-name">Nome Spesa (es. Spesa, Benzina)</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="planned-name" required placeholder="Benzina" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="planned-amount">Prezzo stimato (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="number" step="0.01" id="planned-amount" required placeholder="50.00" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Annulla</button>
        <button type="submit" class="btn btn-primary">Aggiungi</button>
      </div>
    </form>
  `;
  
  renderModalHTML('Nuova Spesa Variabile', formHTML);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  
  document.getElementById('add-planned-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('planned-name').value;
    const amount = parseFloat(document.getElementById('planned-amount').value);
    
    const today = new Date();
    const res = await db.planned.insert(state.user.id, {
      name,
      amount,
      month: today.getMonth() + 1,
      year: today.getFullYear()
    });
    if (checkError(res, "inserimento spesa variabile")) {
      await fetchAllData();
      closeModal();
      renderDashboard();
    }
  });
}

// Modal: Add Monthly Commitment
function showAddMonthlyModal() {
  const formHTML = `
    <form id="add-monthly-form">
      <div class="form-group">
        <label class="form-label" for="monthly-name">Nome Spesa Fissa</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="monthly-name" required placeholder="Mutuo Casa" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="monthly-day">Giorno di addebito (1-31)</label>
        <div class="input-container">
          ${icons.calendar('input-icon')}
          <input class="input-field" type="number" min="1" max="31" id="monthly-day" required placeholder="16" />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="monthly-amount">Importo (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="number" step="0.01" id="monthly-amount" required placeholder="390.00" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Annulla</button>
        <button type="submit" class="btn btn-primary">Aggiungi</button>
      </div>
    </form>
  `;
  
  renderModalHTML('Aggiungi Spesa Mensile', formHTML);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  
  document.getElementById('add-monthly-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('monthly-name').value;
    const day = parseInt(document.getElementById('monthly-day').value);
    const amount = parseFloat(document.getElementById('monthly-amount').value);
    
    const res = await db.monthly.insert(state.user.id, { name, day, amount });
    if (checkError(res, "inserimento spesa mensile")) {
      await fetchAllData();
      closeModal();
      renderMonthly();
    }
  });
}

// Modal: Add Annual Commitment
function showAddAnnualModal() {
  const formHTML = `
    <form id="add-annual-form">
      <div class="form-group">
        <label class="form-label" for="annual-name">Nome Spesa Annuale</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="annual-name" required placeholder="Bollo Auto" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="annual-month">Mese di addebito</label>
        <div class="input-container">
          ${icons.calendar('input-icon')}
          <select class="input-field" id="annual-month" required style="padding-left: 2.8rem;">
            <option value="1">Gennaio</option>
            <option value="2">Febbraio</option>
            <option value="3">Marzo</option>
            <option value="4">Aprile</option>
            <option value="5">Maggio</option>
            <option value="6">Giugno</option>
            <option value="7">Luglio</option>
            <option value="8">Agosto</option>
            <option value="9">Settembre</option>
            <option value="10">Ottobre</option>
            <option value="11">Novembre</option>
            <option value="12">Dicembre</option>
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="annual-amount">Importo (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="number" step="0.01" id="annual-amount" required placeholder="200.00" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Annulla</button>
        <button type="submit" class="btn btn-primary">Aggiungi</button>
      </div>
    </form>
  `;
  
  renderModalHTML('Aggiungi Spesa Annuale', formHTML);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  
  document.getElementById('add-annual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('annual-name').value;
    const month = parseInt(document.getElementById('annual-month').value);
    const amount = parseFloat(document.getElementById('annual-amount').value);
    
    const res = await db.annual.insert(state.user.id, { name, month, amount });
    if (checkError(res, "inserimento spesa annuale")) {
      await fetchAllData();
      closeModal();
      renderAnnual();
    }
  });
}


// ==========================================
// Initialization & PWA Service Worker
// ==========================================

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
    await fetchAllData();
  } else {
    state.isLoading = false;
    renderAppLoader(false);
  }
  initAppShell();
});

// Register SW
registerServiceWorker();
