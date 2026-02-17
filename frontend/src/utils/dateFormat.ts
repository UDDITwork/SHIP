const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats a date to DD/MM/YYYY format in IST.
 */
export const formatDate = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    return `${day}/${month}/${year}`;
  } catch {
    return 'N/A';
  }
};

/**
 * Formats a date to DD/MM/YYYY, HH:MM AM/PM format in IST.
 */
export const formatDateTime = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    const datePart = formatDate(dateInput);
    const timePart = date.toLocaleTimeString('en-US', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return 'N/A';
  }
};

/**
 * Formats time only: HH:MM:SS AM/PM in IST.
 */
export const formatTime = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return 'N/A';
  }
};

/**
 * Smart date format with "Today" / "Yesterday" labels in IST.
 */
export const formatDateSmart = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';

    // Get today and yesterday in IST
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
    const dateIST = new Date(date.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
    const yesterdayIST = new Date(nowIST);
    yesterdayIST.setDate(yesterdayIST.getDate() - 1);

    const datePart = formatDate(dateInput);
    const timePart = date.toLocaleTimeString('en-US', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    if (dateIST.toDateString() === nowIST.toDateString()) {
      return `Today, ${timePart}`;
    }
    if (dateIST.toDateString() === yesterdayIST.toDateString()) {
      return `Yesterday, ${timePart}`;
    }
    return `${datePart}, ${timePart}`;
  } catch {
    return 'N/A';
  }
};
