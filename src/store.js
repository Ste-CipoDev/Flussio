import { db, isConfigured } from './db.js';
import { isExpenseRemaining } from './utils.js';

// State management
export const state = {
  user: null,
  profile: { salary_day: 27, current_balance: 0 },
  monthlyCommitments: [],
  annualCommitments: [],
  annualStatus: [],
  plannedExpenses: [],
  activeView: 'dashboard', // dashboard, monthly, annual, settings
  isLoading: true,
  isAuthMode: 'login', // login, register
  chartType: localStorage.getItem('flussio_chart_type') || 'bar' // bar, donut
};

export function setChartType(type) {
  state.chartType = type;
  localStorage.setItem('flussio_chart_type', type);
}

// Database error helper
export function checkError(result, actionName) {
  if (result && result.error) {
    console.error(`Error during ${actionName}:`, result.error);
    alert(`Errore (${actionName}): ${result.error.message || JSON.stringify(result.error)}`);
    return false;
  }
  return true;
}

// Sanitize text inputs to prevent XSS
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[&<>"']/g, (match) => {
    const escapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };
    return escapes[match];
  });
}

// ==========================================
// Core Calculations
// ==========================================
export function calculateMetrics() {
  const residuo = Math.round(parseFloat(state.profile.current_balance || 0) * 100) / 100;
  
  // 1. Spese Rimanenti
  const speseRimanenti = Math.round(state.monthlyCommitments
    .filter(item => isExpenseRemaining(item.day, state.profile.salary_day))
    .reduce((sum, item) => sum + parseFloat(item.amount), 0) * 100) / 100;
  
  // 2. Residuo Mese
  const residuoMese = Math.round((residuo - speseRimanenti) * 100) / 100;
  
  // 3. Altre Spese in Programma (Planned)
  const altreSpese = Math.round(state.plannedExpenses.reduce((sum, item) => sum + parseFloat(item.amount), 0) * 100) / 100;
  
  // 4. Rimanenza Mensile
  const rimanenzaMensile = Math.round((residuoMese - altreSpese) * 100) / 100;
  
  return {
    residuo,
    speseRimanenti,
    residuoMese,
    altreSpese,
    rimanenzaMensile
  };
}

// ==========================================
// Fetching Data (Optimized with Promise.all)
// ==========================================
export async function fetchAllData() {
  if (!state.user) return;
  state.isLoading = true;
  
  try {
    const userId = state.user.id;
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();
    
    // Fetch all resources in parallel
    const [profile, monthlyRes, annualRes, annualStatusRes, plannedRes] = await Promise.all([
      db.profile.get(userId),
      db.monthly.list(userId),
      db.annual.list(userId),
      db.annualStatus.list(userId, currentYear),
      db.planned.list(userId, currentMonth, currentYear)
    ]);
    
    state.profile = profile || { salary_day: 27, current_balance: 0 };
    state.monthlyCommitments = monthlyRes.data || [];
    state.annualCommitments = annualRes.data || [];
    state.annualStatus = annualStatusRes.data || [];
    state.plannedExpenses = plannedRes.data || [];
    
  } catch (err) {
    console.error('Error fetching data in parallel:', err);
  } finally {
    state.isLoading = false;
  }
}

// ==========================================
// DB Wrappers (Optimistic Local State Update)
// ==========================================
export async function updateProfile(updates) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.profile.update(state.user.id, updates);
  if (checkError(res, "salvataggio profilo")) {
    state.profile = { ...state.profile, ...res.data };
    return res;
  }
  return res;
}

export async function insertMonthly({ name, day, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const sanitizedName = sanitizeText(name);
  const res = await db.monthly.insert(state.user.id, { name: sanitizedName, day, amount });
  if (checkError(res, "inserimento spesa fisse")) {
    state.monthlyCommitments.push(res.data);
    state.monthlyCommitments.sort((a, b) => a.day - b.day);
    return res;
  }
  return res;
}

export async function deleteMonthly(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.monthly.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa fissa")) {
    state.monthlyCommitments = state.monthlyCommitments.filter(item => item.id !== id);
    return res;
  }
  return res;
}

export async function updateMonthly(id, { name, day, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const sanitizedName = sanitizeText(name);
  const res = await db.monthly.update(state.user.id, id, { name: sanitizedName, day, amount });
  if (checkError(res, "aggiornamento spesa fissa")) {
    state.monthlyCommitments = state.monthlyCommitments.map(item => item.id === id ? res.data : item);
    state.monthlyCommitments.sort((a, b) => a.day - b.day);
    return res;
  }
  return res;
}

export async function insertAnnual({ name, month, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const sanitizedName = sanitizeText(name);
  const res = await db.annual.insert(state.user.id, { name: sanitizedName, month, amount });
  if (checkError(res, "inserimento spesa annuale")) {
    state.annualCommitments.push(res.data);
    state.annualCommitments.sort((a, b) => a.month - b.month);
    return res;
  }
  return res;
}

export async function deleteAnnual(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annual.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa annuale")) {
    state.annualCommitments = state.annualCommitments.filter(item => item.id !== id);
    state.annualStatus = state.annualStatus.filter(item => item.annual_commitment_id !== id);
    return res;
  }
  return res;
}

export async function confirmAnnual(annualCommitmentId, year) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annualStatus.confirm(state.user.id, annualCommitmentId, year);
  if (checkError(res, "conferma pagamento annuale")) {
    state.annualStatus.push(res.data);
    return res;
  }
  return res;
}

export async function unconfirmAnnual(annualCommitmentId, year) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annualStatus.unconfirm(state.user.id, annualCommitmentId, year);
  if (checkError(res, "annullamento pagamento annuale")) {
    state.annualStatus = state.annualStatus.filter(
      item => !(item.annual_commitment_id === annualCommitmentId && item.year === parseInt(year))
    );
    return res;
  }
  return res;
}

export async function insertPlanned({ name, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const sanitizedName = sanitizeText(name);
  const res = await db.planned.insert(state.user.id, { name: sanitizedName, amount });
  if (checkError(res, "inserimento spesa variabile")) {
    state.plannedExpenses.push(res.data);
    return res;
  }
  return res;
}

export async function deletePlanned(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.planned.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa variabile")) {
    state.plannedExpenses = state.plannedExpenses.filter(item => item.id !== id);
    return res;
  }
  return res;
}

// ==========================================
// Bulk Import (Optimized to avoid N HTTP calls)
// ==========================================
export async function executeImport(data) {
  const userId = state.user.id;
  try {
    // 1. Update Profile (Upsert)
    if (data.profile) {
      const res = await db.profile.update(userId, {
        salary_day: data.profile.salary_day,
        current_balance: data.profile.current_balance
      });
      if (!checkError(res, "importazione profilo")) return false;
    }

    // 2. Clear & Import Monthly Commitments (Bulk - 2 HTTP calls instead of 2 * N)
    const clearMonthlyRes = await db.monthly.clear(userId);
    if (!checkError(clearMonthlyRes, "pulizia spese mensili")) return false;
    
    if (data.monthlyCommitments && data.monthlyCommitments.length > 0) {
      // Sanitize names during import
      const sanitizedMonthly = data.monthlyCommitments.map(item => ({
        ...item,
        name: sanitizeText(item.name)
      }));
      const res = await db.monthly.insertBulk(userId, sanitizedMonthly);
      if (!checkError(res, "importazione spese mensili")) return false;
    }

    // 3. Clear & Import Annual Commitments (Bulk)
    const clearAnnualRes = await db.annual.clear(userId);
    if (!checkError(clearAnnualRes, "pulizia spese annuali")) return false;

    if (data.annualCommitments && data.annualCommitments.length > 0) {
      const sanitizedAnnual = data.annualCommitments.map(item => ({
        ...item,
        name: sanitizeText(item.name)
      }));
      const res = await db.annual.insertBulk(userId, sanitizedAnnual);
      if (!checkError(res, "importazione spese annuale")) return false;
    }

    // 4. Clear & Import Planned Expenses (Bulk)
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const clearPlannedRes = await db.planned.clear(userId, currentMonth, currentYear);
    if (!checkError(clearPlannedRes, "pulizia spese variabili")) return false;

    if (data.plannedExpenses && data.plannedExpenses.length > 0) {
      const formattedPlanned = data.plannedExpenses.map(item => ({
        name: sanitizeText(item.name),
        amount: item.amount,
        month: currentMonth,
        year: currentYear
      }));
      const res = await db.planned.insertBulk(userId, formattedPlanned);
      if (!checkError(res, "importazione spesa variabile")) return false;
    }

    // Refresh memory cache in a single run
    await fetchAllData();
    return true;
  } catch (err) {
    alert('Errore imprevisto durante l\'importazione: ' + err.message);
    return false;
  }
}
