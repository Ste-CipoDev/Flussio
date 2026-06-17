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

// ==========================================
// Core Calculations
// ==========================================
export function calculateMetrics() {
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
// Fetching Data
// ==========================================
export async function fetchAllData() {
  if (!state.user) return;
  state.isLoading = true;
  
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
  }
}

// ==========================================
// DB Wrappers
// ==========================================
export async function updateProfile(updates) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.profile.update(state.user.id, updates);
  if (checkError(res, "salvataggio profilo")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function insertMonthly({ name, day, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.monthly.insert(state.user.id, { name, day, amount });
  if (checkError(res, "inserimento spesa fissa")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function deleteMonthly(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.monthly.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa fissa")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function insertAnnual({ name, month, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annual.insert(state.user.id, { name, month, amount });
  if (checkError(res, "inserimento spesa annuale")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function deleteAnnual(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annual.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa annuale")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function confirmAnnual(annualCommitmentId, year) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annualStatus.confirm(state.user.id, annualCommitmentId, year);
  if (checkError(res, "conferma pagamento annuale")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function unconfirmAnnual(annualCommitmentId, year) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.annualStatus.unconfirm(state.user.id, annualCommitmentId, year);
  if (checkError(res, "annullamento pagamento annuale")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function insertPlanned({ name, amount }) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const today = new Date();
  const res = await db.planned.insert(state.user.id, {
    name,
    amount,
    month: today.getMonth() + 1,
    year: today.getFullYear()
  });
  if (checkError(res, "inserimento spesa variabile")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function deletePlanned(id) {
  if (!state.user) return { error: new Error("Utente non loggato") };
  const res = await db.planned.delete(state.user.id, id);
  if (checkError(res, "eliminazione spesa variabile")) {
    await fetchAllData();
    return res;
  }
  return res;
}

export async function executeImport(data) {
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
    await fetchAllData();
    return true;
  } catch (err) {
    alert('Errore imprevisto durante l\'importazione: ' + err.message);
    return false;
  }
}
