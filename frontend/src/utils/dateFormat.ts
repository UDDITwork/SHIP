/**
 * Formats a date to DD/MM/YYYY format.
 */
export const formatDate = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return 'N/A';
  }
};

/**
 * Formats a date to DD/MM/YYYY, HH:MM AM/PM format.
 */
export const formatDateTime = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    const datePart = formatDate(dateInput);
    const timePart = date.toLocaleTimeString('en-US', {
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
 * Formats time only: HH:MM:SS AM/PM
 */
export const formatTime = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', {
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
 * Smart date format with "Today" / "Yesterday" labels.
 */
export const formatDateSmart = (dateInput?: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'N/A';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const datePart = formatDate(dateInput);
    const timePart = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${timePart}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${timePart}`;
    }
    return `${datePart}, ${timePart}`;
  } catch {
    return 'N/A';
  }
};
