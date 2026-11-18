import { icons } from './icons.js';
import * as store from './store.js';
import { escapeHtml, parseAmount } from './utils.js';

let closeTimer = null;
let escapeKeyHandler = null;

export function closeModal() {
  if (escapeKeyHandler) {
    document.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }
  const modal = document.getElementById('modal-overlay-el');
  if (modal) {
    modal.classList.remove('active');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      const container = document.getElementById('modal-container');
      if (container) container.innerHTML = '';
      closeTimer = null;
    }, 200);
  }
}

function showModalError(message) {
  const errEl = document.getElementById('modal-error-box');
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('active');
  }
}

function clearModalError() {
  const errEl = document.getElementById('modal-error-box');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('active');
  }
}

export function renderModalHTML(title, formHTML) {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (escapeKeyHandler) {
    document.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }

  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-overlay active" id="modal-overlay-el">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="modal-close" id="modal-close-btn">${icons.close('w-5 h-5')}</button>
        </div>
        ${formHTML}
        <div id="modal-error-box" class="modal-error" role="alert"></div>
      </div>
    </div>
  `;

  // Attach close events
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-overlay-el').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay-el') closeModal();
  });

  escapeKeyHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escapeKeyHandler);

  // Programmatic focus on dynamic innerHTML
  const autoEl = container.querySelector('[autofocus]');
  if (autoEl) autoEl.focus();
}

function bindModalSubmit(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearModalError();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvataggio...';
    }

    try {
      await handler();
    } finally {
      if (submitBtn && document.body.contains(submitBtn)) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });
}

// Modal: Update Residuo (Current balance)
export function showEditResiduoModal(onSuccess) {
  const formHTML = `
    <form id="edit-residuo-form">
      <div class="form-group">
        <label class="form-label" for="residuo-val">Nuovo Residuo Conto (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="text" inputmode="decimal" id="residuo-val" value="${escapeHtml(store.state.profile.current_balance)}" required autofocus />
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

  bindModalSubmit('edit-residuo-form', async () => {
    const val = parseAmount(document.getElementById('residuo-val').value);
    if (val === null) {
      showModalError('Inserisci un importo numerico valido (es. 1250,50).');
      return;
    }

    const res = await store.updateProfile({ current_balance: val });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}

// Modal: Add Planned Expense
export function showAddPlannedModal(onSuccess) {
  const formHTML = `
    <form id="add-planned-form">
      <div class="form-group">
        <label class="form-label" for="planned-name">Nome Spesa (es. Spesa, Benzina)</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="planned-name" required placeholder="Benzina" maxlength="20" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="planned-amount">Prezzo stimato (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="text" inputmode="decimal" id="planned-amount" required placeholder="50.00" />
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

  bindModalSubmit('add-planned-form', async () => {
    const name = document.getElementById('planned-name').value.trim();
    const amount = parseAmount(document.getElementById('planned-amount').value);

    if (!name) {
      showModalError('Inserisci un nome valido per la spesa.');
      return;
    }
    if (amount === null || amount <= 0) {
      showModalError('Inserisci un importo positivo valido (es. 50,00).');
      return;
    }

    const res = await store.insertPlanned({ name, amount });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}

// Modal: Add Monthly Commitment
export function showAddMonthlyModal(onSuccess) {
  const formHTML = `
    <form id="add-monthly-form">
      <div class="form-group">
        <label class="form-label" for="monthly-name">Nome Spesa Fissa</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="monthly-name" required placeholder="Mutuo Casa" maxlength="20" autofocus />
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
          <input class="input-field" type="text" inputmode="decimal" id="monthly-amount" required placeholder="390.00" />
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

  bindModalSubmit('add-monthly-form', async () => {
    const name = document.getElementById('monthly-name').value.trim();
    const day = parseInt(document.getElementById('monthly-day').value, 10);
    const amount = parseAmount(document.getElementById('monthly-amount').value);

    if (!name) {
      showModalError('Inserisci un nome valido per la spesa fissa.');
      return;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      showModalError('Il giorno di addebito deve essere compreso tra 1 e 31.');
      return;
    }
    if (amount === null || amount <= 0) {
      showModalError('Inserisci un importo positivo valido (es. 390,00).');
      return;
    }

    const res = await store.insertMonthly({ name, day, amount });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}

// Modal: Add Annual Commitment
export function showAddAnnualModal(onSuccess) {
  const formHTML = `
    <form id="add-annual-form">
      <div class="form-group">
        <label class="form-label" for="annual-name">Nome Spesa Annuale</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="annual-name" required placeholder="Bollo Auto" maxlength="20" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="annual-month">Mese di pagamento</label>
        <div class="input-container">
          ${icons.calendar('input-icon')}
          <select class="input-field input-select-month" id="annual-month" required>
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
          <input class="input-field" type="text" inputmode="decimal" id="annual-amount" required placeholder="200.00" />
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

  bindModalSubmit('add-annual-form', async () => {
    const name = document.getElementById('annual-name').value.trim();
    const month = parseInt(document.getElementById('annual-month').value, 10);
    const amount = parseAmount(document.getElementById('annual-amount').value);

    if (!name) {
      showModalError('Inserisci un nome valido per la spesa annuale.');
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      showModalError('Seleziona un mese valido (1-12).');
      return;
    }
    if (amount === null || amount <= 0) {
      showModalError('Inserisci un importo positivo valido (es. 200,00).');
      return;
    }

    const res = await store.insertAnnual({ name, month, amount });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}

// Modal: Edit Monthly Commitment
export function showEditMonthlyModal(item, onSuccess) {
  const formHTML = `
    <form id="edit-monthly-form">
      <div class="form-group">
        <label class="form-label" for="monthly-name">Nome Spesa Fissa</label>
        <div class="input-container">
          ${icons.fileText('input-icon')}
          <input class="input-field" type="text" id="monthly-name" required placeholder="Mutuo Casa" value="${escapeHtml(item.name)}" maxlength="20" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="monthly-day">Giorno di addebito (1-31)</label>
        <div class="input-container">
          ${icons.calendar('input-icon')}
          <input class="input-field" type="number" min="1" max="31" id="monthly-day" required placeholder="16" value="${escapeHtml(item.day)}" />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="monthly-amount">Importo (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="text" inputmode="decimal" id="monthly-amount" required placeholder="390.00" value="${escapeHtml(item.amount)}" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Annulla</button>
        <button type="submit" class="btn btn-primary">Salva</button>
      </div>
    </form>
  `;

  renderModalHTML('Modifica Spesa Mensile', formHTML);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);

  bindModalSubmit('edit-monthly-form', async () => {
    const name = document.getElementById('monthly-name').value.trim();
    const day = parseInt(document.getElementById('monthly-day').value, 10);
    const amount = parseAmount(document.getElementById('monthly-amount').value);

    if (!name) {
      showModalError('Inserisci un nome valido per la spesa fissa.');
      return;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      showModalError('Il giorno di addebito deve essere compreso tra 1 e 31.');
      return;
    }
    if (amount === null || amount <= 0) {
      showModalError('Inserisci un importo positivo valido (es. 390,00).');
      return;
    }

    const res = await store.updateMonthly(item.id, { name, day, amount });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}
