import { icons } from './icons.js';
import * as store from './store.js';

export function closeModal() {
  const modal = document.getElementById('modal-overlay-el');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      document.getElementById('modal-container').innerHTML = '';
    }, 200);
  }
}

export function renderModalHTML(title, formHTML) {
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
export function showEditResiduoModal(onSuccess) {
  const formHTML = `
    <form id="edit-residuo-form">
      <div class="form-group">
        <label class="form-label" for="residuo-val">Nuovo Residuo Conto (€)</label>
        <div class="input-container">
          ${icons.euro('input-icon')}
          <input class="input-field" type="number" step="0.01" id="residuo-val" value="${store.state.profile.current_balance}" required autofocus />
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
          <input class="input-field" type="text" id="annual-name" required placeholder="Bollo Auto" autofocus />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label" for="annual-month">Mese di pagamento</label>
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
    
    const res = await store.insertAnnual({ name, month, amount });
    if (!res.error) {
      closeModal();
      if (onSuccess) onSuccess();
    }
  });
}
