const Remittance = require('../models/Remittance');

/**
 * Get the next Friday from a given date.
 * If the date IS a Friday, returns the same date.
 */
function getNextFriday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 5=Fri
  if (day === 5) return d; // Already Friday
  const daysUntilFriday = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

/**
 * Format date as DDMMYYYY string for remittance number
 */
function formatRemittanceDate(date) {
  const d = new Date(date);
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/**
 * Generate a unique remittance number.
 * Format: R{clientId}{DDMMYYYY}/{serial}
 * Example: RSS0012314022026/01
 */
async function generateRemittanceNumber(clientId, remittanceDate) {
  const dateStr = formatRemittanceDate(remittanceDate);
  const prefix = `R${clientId}${dateStr}`;

  // Count existing remittances with this prefix
  const existingCount = await Remittance.countDocuments({
    remittance_number: { $regex: `^${escapeRegex(prefix)}/` }
  });

  const serial = (existingCount + 1).toString().padStart(2, '0');
  return `${prefix}/${serial}`;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate an AWB for remittance eligibility.
 * Returns { valid: true, order, user } or { valid: false, error: string }
 */
function validateAWBForRemittance(order, remittedAwbSet, awbToRemittanceMap) {
  if (!order) {
    return { valid: false, error: 'AWB not found in system' };
  }

  if (order.status !== 'delivered') {
    return { valid: false, error: `Order status is "${order.status}", must be "delivered"` };
  }

  if (order.payment_info?.payment_mode !== 'COD') {
    return { valid: false, error: `Payment mode is "${order.payment_info?.payment_mode}", must be "COD"` };
  }

  const codAmount = order.payment_info?.cod_amount;
  if (!codAmount || codAmount <= 0) {
    return { valid: false, error: `COD amount is ${codAmount || 0}, must be > 0` };
  }

  const awb = order.delhivery_data?.waybill;

  // Check if already remitted via order field
  if (order.payment_info?.cod_remitted === true) {
    return { valid: false, error: 'Already remitted (order marked as cod_remitted)' };
  }

  // Check if AWB exists in any existing remittance
  if (remittedAwbSet && remittedAwbSet.has(awb)) {
    const existingRemittance = awbToRemittanceMap?.get(awb);
    return { valid: false, error: `Already in remittance ${existingRemittance?.number || 'unknown'}` };
  }

  return { valid: true };
}

module.exports = {
  getNextFriday,
  formatRemittanceDate,
  generateRemittanceNumber,
  validateAWBForRemittance,
  escapeRegex
};
