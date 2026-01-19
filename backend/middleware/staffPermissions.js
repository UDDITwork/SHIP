/**
 * Staff Permissions Middleware
 *
 * This middleware checks if staff members have the required permissions
 * for specific actions. Admin users always have full access.
 */

const logger = require('../utils/logger');

/**
 * Check if the user has a specific permission
 * @param {string} permissionKey - The permission to check (e.g., 'wallet_recharge', 'can_recharge_wallet')
 * @returns {Function} Express middleware function
 */
const checkPermission = (permissionKey) => {
  return async (req, res, next) => {
    // Admin always has all permissions
    if (req.admin) {
      return next();
    }

    // Staff must have the specific permission
    if (req.staff) {
      const permissions = req.staff.permissions || {};

      // Check if staff has the permission
      if (permissions[permissionKey] === true) {
        return next();
      }

      logger.warn('Staff permission denied', {
        staffEmail: req.staff.email,
        requiredPermission: permissionKey,
        staffPermissions: permissions
      });

      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have permission for: ${formatPermissionName(permissionKey)}`
      });
    }

    // No admin or staff context
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access. Authentication required.'
    });
  };
};

/**
 * Check if the user has ALL of the specified permissions
 * @param {string[]} permissionKeys - Array of permissions to check
 * @returns {Function} Express middleware function
 */
const checkAllPermissions = (permissionKeys) => {
  return async (req, res, next) => {
    // Admin always has all permissions
    if (req.admin) {
      return next();
    }

    if (req.staff) {
      const permissions = req.staff.permissions || {};

      // Check all required permissions
      const missingPermissions = permissionKeys.filter(key => !permissions[key]);

      if (missingPermissions.length === 0) {
        return next();
      }

      logger.warn('Staff permissions denied (missing multiple)', {
        staffEmail: req.staff.email,
        requiredPermissions: permissionKeys,
        missingPermissions
      });

      return res.status(403).json({
        success: false,
        message: `Access denied. Missing permissions: ${missingPermissions.map(formatPermissionName).join(', ')}`
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Unauthorized access. Authentication required.'
    });
  };
};

/**
 * Check if the user has ANY of the specified permissions
 * @param {string[]} permissionKeys - Array of permissions to check
 * @returns {Function} Express middleware function
 */
const checkAnyPermission = (permissionKeys) => {
  return async (req, res, next) => {
    // Admin always has all permissions
    if (req.admin) {
      return next();
    }

    if (req.staff) {
      const permissions = req.staff.permissions || {};

      // Check if staff has any of the required permissions
      const hasAny = permissionKeys.some(key => permissions[key] === true);

      if (hasAny) {
        return next();
      }

      logger.warn('Staff permissions denied (needs at least one)', {
        staffEmail: req.staff.email,
        requiredPermissions: permissionKeys
      });

      return res.status(403).json({
        success: false,
        message: `Access denied. You need at least one of these permissions: ${permissionKeys.map(formatPermissionName).join(', ')}`
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Unauthorized access. Authentication required.'
    });
  };
};

/**
 * Format permission key to human-readable name
 * @param {string} key - Permission key
 * @returns {string} Human-readable permission name
 */
const formatPermissionName = (key) => {
  const names = {
    dashboard: 'Dashboard Access',
    clients: 'Clients Management',
    orders: 'Orders Management',
    tickets: 'Tickets Management',
    billing: 'Billing Access',
    remittances: 'Remittances Management',
    ndr: 'NDR Management',
    weight_discrepancies: 'Weight Discrepancies',
    wallet_recharge: 'Wallet Recharge Access',
    rate_cards: 'Rate Cards Management',
    carriers: 'Carriers Management',
    staff_management: 'Staff Management',
    can_recharge_wallet: 'Wallet Recharge',
    can_change_client_category: 'Change Client Category',
    can_generate_monthly_billing: 'Generate Monthly Billing'
  };
  return names[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Check if user is admin only (staff not allowed)
 */
const adminOnly = (req, res, next) => {
  if (req.staff) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This action requires admin privileges.'
    });
  }
  if (!req.admin) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access. Admin credentials required.'
    });
  }
  next();
};

module.exports = {
  checkPermission,
  checkAllPermissions,
  checkAnyPermission,
  adminOnly
};
