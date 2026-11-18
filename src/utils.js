function clampDay(day, fallback = 1) {
  const parsed = parseInt(day, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(31, parsed);
}

// Returns the date of the next salary
export function getNextSalaryDate(salaryDay) {
  const safeSalaryDay = clampDay(salaryDay, 27);
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-11
  
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  
  let targetDay = Math.min(safeSalaryDay, getDaysInMonth(year, month));
  let salaryDateThisMonth = new Date(year, month, targetDay, 0, 0, 0);
  
  if (today < salaryDateThisMonth) {
    return salaryDateThisMonth;
  } else {
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    targetDay = Math.min(safeSalaryDay, getDaysInMonth(year, month));
    return new Date(year, month, targetDay, 0, 0, 0);
  }
}

// Determines if a monthly expense day falls between today and the day before the next salary
export function isExpenseRemaining(expenseDay, salaryDay) {
  const safeExpenseDay = clampDay(expenseDay, 1);
  const today = new Date();
  const nextSalary = getNextSalaryDate(salaryDay);
  
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  
  // Start of today (00:00:00) to ignore times in comparisons
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  
  // 1. Check current month occurrence
  let year = today.getFullYear();
  let month = today.getMonth();
  let targetDay = Math.min(safeExpenseDay, getDaysInMonth(year, month));
  let expenseDateCurrentMonth = new Date(year, month, targetDay, 0, 0, 0);
  
  // 2. Check next month occurrence
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }
  let nextTargetDay = Math.min(safeExpenseDay, getDaysInMonth(nextYear, nextMonth));
  let expenseDateNextMonth = new Date(nextYear, nextMonth, nextTargetDay, 0, 0, 0);
  
  const isCurrentMonthRemaining = (expenseDateCurrentMonth >= todayStart && expenseDateCurrentMonth < nextSalary);
  const isNextMonthRemaining = (expenseDateNextMonth >= todayStart && expenseDateNextMonth < nextSalary);
  
  return isCurrentMonthRemaining || isNextMonthRemaining;
}

// Formats a date into DD/MM/YYYY
export function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Formats currency
export function formatCurrency(amount) {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(safeAmount);
}

// Returns the Italian name of the month
export function getMonthName(monthNum) {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[monthNum - 1] || '';
}

// Escape HTML characters at render time to prevent XSS without mutating stored data
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (match) => {
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

// Strict monetary amount parser supporting Italian ("1.200,50") and dot ("1200.50") decimals
export function parseAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  }
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Italian format: 1.200,50
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,200.50
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}
