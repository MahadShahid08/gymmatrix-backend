// utils/paymentUtils.js

export const getCurrentMonthPaymentPeriod = () => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // If we're between 1st and 4th of the month, we're in the "overdue period" of previous month
  const isInOverduePeriod = currentDay < 5;
  
  // If we're in overdue period, use previous month
  const month = isInOverduePeriod ? 
    (currentMonth === 0 ? 12 : currentMonth) : 
    (currentMonth + 1);
    
  const year = isInOverduePeriod && month === 12 ? 
    currentYear - 1 : 
    currentYear;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Payment is overdue if:
  // 1. We're after the 15th of the current month, or
  // 2. We're in the overdue period (1st-4th) of the next month
  const isOverdue = currentDay > 15 || isInOverduePeriod;

  // A payment record should exist if:
  // 1. We're after the 5th of the current month, or
  // 2. We're in the overdue period of the next month
  const shouldHavePaymentRecord = currentDay >= 5 || isInOverduePeriod;

  return {
    monthYear: `${month}-${year}`,
    monthName: monthNames[month - 1],
    year,
    startDate: new Date(year, month - 1, 5),
    dueDate: new Date(year, month - 1, 15),
    isOverdue,
    shouldHavePaymentRecord,
    isInOverduePeriod,
    currentDate: currentDay
  };
};

export const getPaymentStatus = (paymentDate = new Date()) => {
  const { isOverdue, shouldHavePaymentRecord } = getCurrentMonthPaymentPeriod();
  
  if (!shouldHavePaymentRecord) {
    return null; // No payment record should exist yet
  }
  
  return isOverdue ? 'OVERDUE' : 'PENDING';
};

export const formatMonthYear = (monthYear) => {
  if (!monthYear) return '';
  
  const [month, year] = monthYear.split('-');
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  return `${monthNames[parseInt(month) - 1]} ${year}`;
};

// Helper to check if a date is between 5th and 15th of its month
export const isInPendingPeriod = (date = new Date()) => {
  const day = date.getDate();
  return day >= 5 && day <= 15;
};

// Helper to check if we should create new payment records
export const shouldCreateNewPayments = (date = new Date()) => {
  return date.getDate() === 5;
};

// Helper to check if we should mark payments as overdue
export const shouldMarkOverdue = (date = new Date()) => {
  return date.getDate() === 16;
};