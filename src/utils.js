// Returns the date of the next salary
export function getNextSalaryDate(salaryDay) {
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
export function isExpenseRemaining(expenseDay, salaryDay) {
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
export function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Formats currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

// Returns the Italian name of the month
export function getMonthName(monthNum) {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[monthNum - 1];
}
