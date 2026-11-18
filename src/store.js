import { db } from './db.js';
import { isExpenseRemaining, parseAmount } from './utils.js';

function resolveInitialChartTab() {
  const saved = localStorage.getItem('flussio_chart_type');
  if (saved === 'planned' || saved === 'donut') return 'planned';
  return 'fixed';
}

// State management
export const state = {
  user: null,
  profile: { salary_day: 27, salary_amount: 0, current_balance: 0 },
  monthlyCommitments: [],
  annualCommitments: [],
  annualStatus: [],
  plannedExpenses: [],
  activeView: 'dashboard', // dashboard, monthly, annual, settings
  isLoading: true,
  isAuthMode: 'login', // login, register
  chartType: resolveInitialChartTab() // fixed, planned
};

export function resetState() {
  state.profile = { salary_day: 27, salary_amount: 0, current_balance: 0 };
  state.monthlyCommitments = [];
  state.annualCommitments = [];
  state.annualStatus = [];
  state.plannedExpenses = [];
  state.activeView = 'dashboard';
  state.isLoading = false;
}

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

// Normalize text inputs for DB storage (HTML escaping happens strictly at render time)
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

function toCents(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ==========================================
// Core Calculations (Integer Cents)
// ==========================================
export function calculateMetrics() {
  const residuoCents = toCents(state.profile.current_balance || 0);
  const stipendioCents = toCents(state.profile.salary_amount || 0);

  // 1. Spese Fisse Totali & Spese Rimanenti
  const totaleSpeseFisseCents = state.monthlyCommitments
    .reduce((sum, item) => sum + toCents(item.amount), 0);

  const speseRimanentiCents = state.monthlyCommitments
    .filter(item => isExpenseRemaining(item.day, state.profile.salary_day))
    .reduce((sum, item) => sum + toCents(item.amount), 0);

  // 2. Residuo Mese (saldo tolte spese mensili mancanti)
  const residuoMeseCents = residuoCents - speseRimanentiCents;

  // 3. Altre Spese in Programma (Planned)
  const altreSpeseCents = state.plannedExpenses
    .reduce((sum, item) => sum + toCents(item.amount), 0);

  // 4. Rimanenza Mensile
  const rimanenzaMensileCents = residuoMeseCents - altreSpeseCents;

  return {
    residuo: residuoCents / 100,
    stipendio: stipendioCents / 100,
    totaleSpeseFisse: totaleSpeseFisseCents / 100,
    stipendioResiduoDopoFisse: (stipendioCents - totaleSpeseFisseCents) / 100,
    speseRimanenti: speseRimanentiCents / 100,
    residuoMese: residuoMeseCents / 100,
    altreSpese: altreSpeseCents / 100,
    rimanenzaMensile: rimanenzaMensileCents / 100
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
    
    state.profile = profile || { salary_day: 27, salary_amount: 0, current_balance: 0 };
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
  const today = new Date();
  const res = await db.planned.insert(state.user.id, {
    name: sanitizedName,
    amount,
    month: today.getMonth() + 1,
    year: today.getFullYear()
  });
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
// Bulk Import (Validated + Rollback-Safe)
// ==========================================
export function validateImportData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Il file JSON non contiene un oggetto valido.' };
  }

  const hasAnySection = ['profile', 'monthlyCommitments', 'annualCommitments', 'plannedExpenses']
    .some(key => Object.prototype.hasOwnProperty.call(data, key));
  if (!hasAnySection) {
    return { valid: false, error: 'Il file JSON non contiene alcuna sezione riconosciuta da Flussio.' };
  }

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const normalized = {
    profile: null,
    monthlyCommitments: [],
    annualCommitments: [],
    plannedExpenses: [],
    annualStatus: []
  };

  if (data.profile !== undefined && data.profile !== null) {
    if (typeof data.profile !== 'object' || Array.isArray(data.profile)) {
      return { valid: false, error: 'Sezione "profile" non valida.' };
    }
    const salaryDay = parseInt(data.profile.salary_day, 10);
    const balance = parseAmount(data.profile.current_balance);
    const salaryAmountRaw = data.profile.salary_amount;
    const salaryAmount = salaryAmountRaw !== undefined && salaryAmountRaw !== null
      ? parseAmount(salaryAmountRaw)
      : 0;
    if (!Number.isFinite(salaryDay) || salaryDay < 1 || salaryDay > 31) {
      return { valid: false, error: 'Campo "profile.salary_day" non valido (atteso 1-31).' };
    }
    if (balance === null) {
      return { valid: false, error: 'Campo "profile.current_balance" non valido.' };
    }
    if (salaryAmount === null || salaryAmount < 0) {
      return { valid: false, error: 'Campo "profile.salary_amount" non valido (atteso >= 0).' };
    }
    normalized.profile = {
      salary_day: salaryDay,
      salary_amount: salaryAmount,
      current_balance: balance
    };
  }

  if (data.monthlyCommitments !== undefined) {
    if (!Array.isArray(data.monthlyCommitments)) {
      return { valid: false, error: 'Sezione "monthlyCommitments" non valida (atteso array).' };
    }
    for (let i = 0; i < data.monthlyCommitments.length; i++) {
      const item = data.monthlyCommitments[i];
      const name = sanitizeText(item?.name);
      const day = parseInt(item?.day, 10);
      const amount = parseAmount(item?.amount);
      if (!name || !Number.isFinite(day) || day < 1 || day > 31 || amount === null || amount <= 0) {
        return { valid: false, error: `Spesa mensile #${i + 1} non valida (richiesti name, day 1-31, amount > 0).` };
      }
      normalized.monthlyCommitments.push({ name, day, amount });
    }
  }

  if (data.annualCommitments !== undefined) {
    if (!Array.isArray(data.annualCommitments)) {
      return { valid: false, error: 'Sezione "annualCommitments" non valida (atteso array).' };
    }
    for (let i = 0; i < data.annualCommitments.length; i++) {
      const item = data.annualCommitments[i];
      const name = sanitizeText(item?.name);
      const month = parseInt(item?.month, 10);
      const amount = parseAmount(item?.amount);
      if (!name || !Number.isFinite(month) || month < 1 || month > 12 || amount === null || amount <= 0) {
        return { valid: false, error: `Spesa annuale #${i + 1} non valida (richiesti name, month 1-12, amount > 0).` };
      }
      normalized.annualCommitments.push({ name, month, amount });
    }
  }

  if (data.plannedExpenses !== undefined) {
    if (!Array.isArray(data.plannedExpenses)) {
      return { valid: false, error: 'Sezione "plannedExpenses" non valida (atteso array).' };
    }
    for (let i = 0; i < data.plannedExpenses.length; i++) {
      const item = data.plannedExpenses[i];
      const name = sanitizeText(item?.name);
      const amount = parseAmount(item?.amount);
      const month = item?.month !== undefined ? parseInt(item.month, 10) : currentMonth;
      const year = item?.year !== undefined ? parseInt(item.year, 10) : currentYear;
      if (!name || amount === null || amount <= 0 || !Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 2000 || year > 2100) {
        return { valid: false, error: `Spesa variabile #${i + 1} non valida.` };
      }
      normalized.plannedExpenses.push({ name, amount, month, year });
    }
  }

  if (Array.isArray(data.annualStatus)) {
    for (const s of data.annualStatus) {
      const name = sanitizeText(s?.name);
      const month = parseInt(s?.month, 10);
      const year = parseInt(s?.year, 10);
      if (name && Number.isFinite(month) && month >= 1 && month <= 12 && Number.isFinite(year)) {
        normalized.annualStatus.push({ name, month, year });
      }
    }
  }

  return { valid: true, normalized };
}

async function rollbackImport(userId, snapshot, currentMonth, currentYear) {
  try {
    if (snapshot.profile) {
      await db.profile.update(userId, {
        salary_day: snapshot.profile.salary_day,
        salary_amount: snapshot.profile.salary_amount ?? 0,
        current_balance: snapshot.profile.current_balance
      });
    }
    await db.monthly.clear(userId);
    if (snapshot.monthlyCommitments.length > 0) {
      await db.monthly.insertBulk(userId, snapshot.monthlyCommitments);
    }
    await db.annual.clear(userId);
    let restoredAnnual = [];
    if (snapshot.annualCommitments.length > 0) {
      const res = await db.annual.insertBulk(userId, snapshot.annualCommitments);
      restoredAnnual = res.data || [];
    }
    for (const st of snapshot.annualStatus) {
      const orig = snapshot.annualCommitments.find(a => a.id === st.annual_commitment_id);
      const match = orig && restoredAnnual.find(a => a.name === orig.name && a.month === orig.month);
      if (match?.id) {
        await db.annualStatus.confirm(userId, match.id, st.year);
      }
    }
    await db.planned.clear(userId, currentMonth, currentYear);
    if (snapshot.plannedExpenses.length > 0) {
      await db.planned.insertBulk(userId, snapshot.plannedExpenses);
    }
  } catch (rollbackErr) {
    console.error('Errore durante il rollback post-importazione:', rollbackErr);
  }
}

export async function executeImport(data) {
  if (!state.user) {
    alert('Utente non autenticato.');
    return false;
  }

  const validation = validateImportData(data);
  if (!validation.valid) {
    alert(`Backup non valido: ${validation.error}`);
    return false;
  }

  const { normalized } = validation;
  const userId = state.user.id;
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const snapshot = {
    profile: { ...state.profile },
    monthlyCommitments: [...state.monthlyCommitments],
    annualCommitments: [...state.annualCommitments],
    annualStatus: [...state.annualStatus],
    plannedExpenses: [...state.plannedExpenses]
  };

  try {
    // 1. Update Profile (Upsert)
    if (normalized.profile) {
      const res = await db.profile.update(userId, normalized.profile);
      if (!checkError(res, "importazione profilo")) {
        await rollbackImport(userId, snapshot, currentMonth, currentYear);
        return false;
      }
    }

    // 2. Clear & Import Monthly Commitments
    const clearMonthlyRes = await db.monthly.clear(userId);
    if (!checkError(clearMonthlyRes, "pulizia spese mensili")) {
      await rollbackImport(userId, snapshot, currentMonth, currentYear);
      return false;
    }

    if (normalized.monthlyCommitments.length > 0) {
      const res = await db.monthly.insertBulk(userId, normalized.monthlyCommitments);
      if (!checkError(res, "importazione spese mensili")) {
        await rollbackImport(userId, snapshot, currentMonth, currentYear);
        return false;
      }
    }

    // 3. Clear & Import Annual Commitments
    const clearAnnualRes = await db.annual.clear(userId);
    if (!checkError(clearAnnualRes, "pulizia spese annuali")) {
      await rollbackImport(userId, snapshot, currentMonth, currentYear);
      return false;
    }

    let insertedAnnual = [];
    if (normalized.annualCommitments.length > 0) {
      const res = await db.annual.insertBulk(userId, normalized.annualCommitments);
      if (!checkError(res, "importazione spese annuali")) {
        await rollbackImport(userId, snapshot, currentMonth, currentYear);
        return false;
      }
      insertedAnnual = res.data || [];
    }

    // 3b. Restore Annual Status confirmations matched by (name, month) if present
    for (const statusItem of normalized.annualStatus) {
      const matchedAnnual = insertedAnnual.find(
        a => a.name === statusItem.name && a.month === statusItem.month
      );
      if (matchedAnnual?.id) {
        await db.annualStatus.confirm(userId, matchedAnnual.id, statusItem.year);
      }
    }

    // 4. Clear & Import Planned Expenses
    const clearPlannedRes = await db.planned.clear(userId, currentMonth, currentYear);
    if (!checkError(clearPlannedRes, "pulizia spese variabili")) {
      await rollbackImport(userId, snapshot, currentMonth, currentYear);
      return false;
    }

    if (normalized.plannedExpenses.length > 0) {
      const res = await db.planned.insertBulk(userId, normalized.plannedExpenses);
      if (!checkError(res, "importazione spese variabili")) {
        await rollbackImport(userId, snapshot, currentMonth, currentYear);
        return false;
      }
    }

    // Refresh memory cache in a single run
    await fetchAllData();
    return true;
  } catch (err) {
    await rollbackImport(userId, snapshot, currentMonth, currentYear);
    alert('Errore imprevisto durante l\'importazione: ' + err.message);
    return false;
  }
}
