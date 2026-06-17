import { icons } from './icons.js';
import * as store from './store.js';
import * as modals from './modals.js';
import { 
  formatDate, 
  formatCurrency, 
  getMonthName, 
  getNextSalaryDate, 
  isExpenseRemaining 
} from './utils.js';
import { db, isConfigured } from './db.js';

// Switch view logic
export function switchView(viewName) {
  store.state.activeView = viewName;
  
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

// Render Chart Visualization helper
function renderChartVisualization(metrics) {
  const container = document.getElementById('chart-display-container');
  if (!container) return;
  
  const R = metrics.residuo;
  const F = metrics.speseRimanenti;
  const V = metrics.altreSpese;
  const L = metrics.rimanenzaMensile;
  
  if (R <= 0) {
    container.innerHTML = `
      <div class="chart-empty-state">
        <span style="color: var(--accent-red); font-weight: 500; font-size: 0.85rem;">Saldo iniziale pari a zero o negativo. Inserisci un saldo per sbloccare i grafici.</span>
      </div>
    `;
    return;
  }
  
  if (store.state.chartType === 'bar') {
    // Segmented progress bar
    const pctF = Math.min(100, (F / R) * 100);
    const pctV = Math.min(100 - pctF, (V / R) * 100);
    const pctL = Math.max(0, 100 - pctF - pctV);
    
    container.innerHTML = `
      <div class="bar-chart-wrapper">
        <div class="bar-chart-track">
          <div class="bar-segment fixed" style="width: ${pctF}%;" title="Spese Fisse: ${pctF.toFixed(0)}%"></div>
          <div class="bar-segment variable" style="width: ${pctV}%;" title="Spese Variabili: ${pctV.toFixed(0)}%"></div>
          <div class="bar-segment free" style="width: ${pctL}%;" title="Rimanenza Libera: ${pctL.toFixed(0)}%"></div>
        </div>
        <div class="bar-chart-legend">
          <div class="legend-item"><span class="dot fixed"></span><span>Fisse (${pctF.toFixed(0)}%)</span></div>
          <div class="legend-item"><span class="dot variable"></span><span>Variabili (${pctV.toFixed(0)}%)</span></div>
          <div class="legend-item"><span class="dot free"></span><span>Libera (${pctL.toFixed(0)}%)</span></div>
        </div>
      </div>
    `;
  } else {
    // Donut Chart SVG
    const freePercentage = Math.max(0, Math.min(100, (L / R) * 100));
    
    const radius = 46;
    const circumference = 2 * Math.PI * radius; // ~289.02
    const strokeDashoffset = circumference - (freePercentage / 100) * circumference;
    
    container.innerHTML = `
      <div class="donut-chart-wrapper">
        <div class="donut-chart-svg-container">
          <svg class="donut-chart-svg" width="130" height="130" viewBox="0 0 110 110">
            <circle class="donut-track" cx="55" cy="55" r="${radius}" stroke="var(--border-color)" stroke-width="9" fill="none" />
            <circle class="donut-indicator" cx="55" cy="55" r="${radius}" 
              stroke="${L >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}" 
              stroke-width="9" 
              fill="none" 
              stroke-linecap="round"
              stroke-dasharray="${circumference}" 
              stroke-dashoffset="${strokeDashoffset}"
              transform="rotate(-90 55 55)" />
            
            <text class="donut-text-val" x="55" y="52" text-anchor="middle" dominant-baseline="middle" fill="var(--text-primary)" font-size="15" font-weight="700" font-family="'Outfit', sans-serif">
              ${freePercentage.toFixed(0)}%
            </text>
            <text class="donut-text-lbl" x="55" y="70" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="8" font-weight="600" font-family="'Inter', sans-serif" letter-spacing="0.05em">
              LIBERO
            </text>
          </svg>
        </div>
        <div class="donut-chart-legend">
          <div class="legend-title">Rimanenza Libera</div>
          <div class="legend-value" style="color: ${L >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
            ${formatCurrency(L)}
          </div>
          <div class="legend-desc">
            Rappresenta il <strong>${freePercentage.toFixed(0)}%</strong> del tuo saldo iniziale (${formatCurrency(R)}).
          </div>
        </div>
      </div>
    `;
  }
}

// Render Dashboard View
export function renderDashboard() {
  const metrics = store.calculateMetrics();
  const nextSalaryDate = getNextSalaryDate(store.state.profile.salary_day);
  const container = document.getElementById('view-dashboard');
  if (!container) return;
  
  container.innerHTML = `
    <!-- Metrics Cards Grid -->
    <div class="summary-grid">
      <!-- Residuo Attuale -->
      <div class="metric-card primary horizontal">
        <div class="metric-info-col">
          <span class="metric-label">Residuo Iniziale</span>
          <span class="metric-details">Ultimo aggiornamento sul conto</span>
        </div>
        <div class="metric-value-col">
          <span class="metric-value">${formatCurrency(metrics.residuo)}</span>
          <button id="edit-residuo-btn" class="metric-action-btn" title="Modifica saldo attuale">
            ${icons.edit('w-5 h-5')}
          </button>
        </div>
      </div>

      <!-- Spese Rimanenti -->
      <div class="metric-card warning horizontal">
        <div class="metric-info-col">
          <span class="metric-label">Spese Fisse Rimanenti</span>
          <span class="metric-details">Fino al prossimo stipendio (${formatDate(nextSalaryDate)})</span>
        </div>
        <div class="metric-value-col">
          <span class="metric-value">${formatCurrency(metrics.speseRimanenti)}</span>
        </div>
      </div>

      <!-- Residuo Mese -->
      <div class="metric-card horizontal">
        <div class="metric-info-col">
          <span class="metric-label">Residuo Mese</span>
          <span class="metric-details">Residuo - Spese Fisse Rimanenti</span>
        </div>
        <div class="metric-value-col">
          <span class="metric-value" style="color: ${metrics.residuoMese >= 0 ? 'var(--text-primary)' : 'var(--accent-red)'}">
            ${formatCurrency(metrics.residuoMese)}
          </span>
        </div>
      </div>

      <!-- Altre Spese / Budget -->
      <div class="metric-card horizontal">
        <div class="metric-info-col">
          <span class="metric-label">Budget Spese Variabili</span>
          <span class="metric-details">Groceries, Benzina, ecc. programmate</span>
        </div>
        <div class="metric-value-col">
          <span class="metric-value" style="color: var(--text-secondary)">${formatCurrency(metrics.altreSpese)}</span>
        </div>
      </div>

      <!-- Rimanenza Mensile -->
      <div class="metric-card success horizontal">
        <div class="metric-info-col">
          <span class="metric-label">Rimanenza Mensile Libera</span>
          <span class="metric-details">Soldi effettivamente liberi</span>
        </div>
        <div class="metric-value-col">
          <span class="metric-value" style="color: ${metrics.rimanenzaMensile >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
            ${formatCurrency(metrics.rimanenzaMensile)}
          </span>
        </div>
      </div>
    </div>

    <!-- Chart Card -->
    <div class="chart-section-card">
      <div class="chart-header">
        <h4>Suddivisione Budget</h4>
        <div class="chart-toggle-control">
          <button id="toggle-chart-bar" class="toggle-btn ${store.state.chartType === 'bar' ? 'active' : ''}">Barra</button>
          <button id="toggle-chart-donut" class="toggle-btn ${store.state.chartType === 'donut' ? 'active' : ''}">Ciambella</button>
        </div>
      </div>
      <div class="chart-body" id="chart-display-container">
        <!-- Renders dynamically -->
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

  // Draw chart visualizer
  renderChartVisualization(metrics);

  // Attach toggle listeners
  const barToggle = document.getElementById('toggle-chart-bar');
  const donutToggle = document.getElementById('toggle-chart-donut');
  
  if (barToggle && donutToggle) {
    barToggle.addEventListener('click', () => {
      if (store.state.chartType !== 'bar') {
        store.setChartType('bar');
        barToggle.classList.add('active');
        donutToggle.classList.remove('active');
        renderChartVisualization(metrics);
      }
    });
    
    donutToggle.addEventListener('click', () => {
      if (store.state.chartType !== 'donut') {
        store.setChartType('donut');
        donutToggle.classList.add('active');
        barToggle.classList.remove('active');
        renderChartVisualization(metrics);
      }
    });
  }

  // Render planned list
  const listContainer = document.getElementById('planned-expenses-list');
  if (store.state.plannedExpenses.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessuna spesa variabile programmata per questo mese.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = store.state.plannedExpenses.map(item => `
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
          const res = await store.deletePlanned(id);
          if (!res.error) {
            renderDashboard();
          }
        }
      });
    });
  }

  // Edit balance click
  document.getElementById('edit-residuo-btn').addEventListener('click', () => {
    modals.showEditResiduoModal(renderDashboard);
  });

  // Add planned expense click
  document.getElementById('add-planned-btn').addEventListener('click', () => {
    modals.showAddPlannedModal(renderDashboard);
  });
}

// Render Monthly Commitments View
export function renderMonthly() {
  const container = document.getElementById('view-monthly');
  if (!container) return;
  
  const totalMonthly = store.state.monthlyCommitments.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  
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
  if (store.state.monthlyCommitments.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessun impegno mensile inserito. Clicca "Aggiungi" per iniziare.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = store.state.monthlyCommitments.map(item => {
      const isRemaining = isExpenseRemaining(item.day, store.state.profile.salary_day);
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
          const res = await store.deleteMonthly(id);
          if (!res.error) {
            renderMonthly();
          }
        }
      });
    });
  }

  // Add monthly commitment click
  document.getElementById('add-monthly-btn').addEventListener('click', () => {
    modals.showAddMonthlyModal(renderMonthly);
  });
}

// Render Annual Commitments View
export function renderAnnual() {
  const container = document.getElementById('view-annual');
  if (!container) return;
  
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
  if (store.state.annualCommitments.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        ${icons.info('w-8 h-8 mx-auto')}
        <p>Nessun impegno annuale inserito. Clicca "Aggiungi" per iniziare.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = store.state.annualCommitments.map(item => {
      const isDueThisMonth = item.month === currentMonth;
      const isConfirmed = store.state.annualStatus.some(s => s.annual_commitment_id === item.id);
      
      let cardStatusClass = '';
      let badgeHtml = '';
      let checkActionClass = '';
      
      if (isDueThisMonth) {
        if (isConfirmed) {
          cardStatusClass = 'status-confirmed';
          badgeHtml = '<span class="item-badge paid">Pagato</span>';
          checkActionClass = 'confirmed';
        } else {
          cardStatusClass = 'status-due';
          badgeHtml = '<span class="item-badge unpaid">Scadenza Questo Mese!</span>';
        }
      }

      return `
        <div class="item-card ${cardStatusClass}">
          <div class="item-info">
            <span class="item-title">${item.name}</span>
            <span class="item-subtitle">Mese di pagamento: <strong>${getMonthName(item.month)}</strong> ${badgeHtml}</span>
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
          res = await store.unconfirmAnnual(id, currentYear);
        } else {
          res = await store.confirmAnnual(id, currentYear);
        }
        if (!res.error) {
          renderAnnual();
        }
      });
    });

    // Attach delete listeners
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Sei sicuro di voler eliminare questa spesa annuale?')) {
          const res = await store.deleteAnnual(id);
          if (!res.error) {
            renderAnnual();
          }
        }
      });
    });
  }

  // Add annual commitment click
  document.getElementById('add-annual-btn').addEventListener('click', () => {
    modals.showAddAnnualModal(renderAnnual);
  });
}

// Render Settings View
export function renderSettings() {
  const container = document.getElementById('view-settings');
  if (!container) return;
  
  const nextSalaryDate = getNextSalaryDate(store.state.profile.salary_day);
  
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
        <span style="font-size: 0.85rem; color: var(--text-secondary);">${store.state.user.email}</span>
      </div>

      <!-- Salary Day Settings -->
      <div class="settings-item">
        <div class="settings-item-left">
          ${icons.calendar('w-5 h-5')}
          <span class="settings-item-title">Giorno dello Stipendio</span>
        </div>
        <div class="settings-action">
          <input type="number" id="settings-salary-day" min="1" max="31" value="${store.state.profile.salary_day}" />
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

    <div class="settings-actions-group" style="margin-top: 1.5rem;">
      <button id="logout-btn" class="btn btn-secondary">
        ${icons.logout('w-5 h-5')} Disconnetti Account
      </button>
      <button id="delete-account-btn" class="btn btn-secondary btn-danger-outline">
        ${icons.trash('w-5 h-5')} Elimina Account e Dati
      </button>
    </div>
  `;

  // Attach change listener to salary day
  const salaryInput = document.getElementById('settings-salary-day');
  if (salaryInput) {
    salaryInput.addEventListener('change', async (e) => {
      let day = parseInt(e.target.value);
      if (isNaN(day) || day < 1) day = 1;
      if (day > 31) day = 31;
      e.target.value = day;
      
      const res = await store.updateProfile({ salary_day: day });
      if (!res.error) {
        renderSettings();
      }
    });
  }

  // Attach logout listener
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Sei sicuro di voler uscire?')) {
        await db.auth.signOut();
      }
    });
  }

  // Attach delete account listener
  const deleteBtn = document.getElementById('delete-account-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirm1 = confirm("ATTENZIONE: Questa azione è irreversibile. Verranno eliminati definitivamente il tuo account e TUTTI i dati associati.\n\nSei sicuro di voler procedere?");
      if (confirm1) {
        const confirm2 = confirm("SEI ASSOLUTAMENTE SICURO?\nTutti i tuoi dati mensili, annuali e il tuo profilo verranno eliminati per sempre dal server.");
        if (confirm2) {
          const loader = document.getElementById('app-loader');
          if (loader) loader.style.display = 'flex';
          const res = await db.auth.deleteAccount();
          if (loader) loader.style.display = 'none';
          if (res.error) {
            alert(`Errore durante l'eliminazione dell'account: ${res.error.message || JSON.stringify(res.error)}`);
          } else {
            alert("Account eliminato con successo. Verrai reindirizzato alla schermata di accesso.");
          }
        }
      }
    });
  }

  // Export backup
  const exportBtn = document.getElementById('export-backup-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const backupData = {
        profile: store.state.profile,
        monthlyCommitments: store.state.monthlyCommitments,
        annualCommitments: store.state.annualCommitments,
        plannedExpenses: store.state.plannedExpenses
      };
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `flussio_backup_${formatDate(new Date()).replace(/\//g, '-')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  // Import backup from file
  const importFile = document.getElementById('import-backup-file');
  if (importFile) {
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (confirm('L\'importazione sovrascriverà tutti i dati correnti. Continuare?')) {
            const loader = document.getElementById('app-loader');
            if (loader) loader.style.display = 'flex';
            const success = await store.executeImport(data);
            if (loader) loader.style.display = 'none';
            if (success) {
              alert('Importazione completata con successo!');
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
}
