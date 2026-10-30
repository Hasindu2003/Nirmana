/**
 * System Roles & Permission Authority
 * Following SOLID principles: Single Responsibility & Open/Closed
 * 
 * Defines the 4 official system roles:
 * 1. ADMIN    - Store Owner / Administrator (full management & settings access)
 * 2. WORKER   - Store Worker (day-to-day store counter, print jobs, POS, inventory)
 * 3. CUSTOMER - Regular Customer (registered customer portal account)
 * 4. GUEST    - Unregistered Customer (visitor browsing products, uploading files, or signing up)
 */

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',       // Store Owner / Administrator
  WORKER: 'WORKER',     // Store Worker
  CUSTOMER: 'CUSTOMER', // Regular Registered Customer
  GUEST: 'GUEST',       // Not-registered Customer / Visitor
});

const ROLE_DEFINITIONS = Object.freeze({
  [ROLES.ADMIN]: {
    key: ROLES.ADMIN,
    name: 'Owner / Admin',
    shortName: 'Owner',
    description: 'Store owner with full system access, user management, and financial control.',
    badgeClass: 'badge bg-danger-subtle text-danger border border-danger-subtle',
    isStaff: true,
    isAdmin: true,
    canBeCreatedByAdmin: true,
  },
  [ROLES.WORKER]: {
    key: ROLES.WORKER,
    name: 'Store Worker',
    shortName: 'Worker',
    description: 'Store worker who handles customer intake, printing orders, POS transactions, and inventory.',
    badgeClass: 'badge bg-primary-subtle text-primary border border-primary-subtle',
    isStaff: true,
    isAdmin: false,
    canBeCreatedByAdmin: true,
  },
  [ROLES.CUSTOMER]: {
    key: ROLES.CUSTOMER,
    name: 'Regular Customer',
    shortName: 'Customer',
    description: 'Registered customer who can track jobs, invoices, payments, and balance via the client portal.',
    badgeClass: 'badge bg-success-subtle text-success border border-success-subtle',
    isStaff: false,
    isAdmin: false,
    canBeCreatedByAdmin: false,
  },
  [ROLES.GUEST]: {
    key: ROLES.GUEST,
    name: 'Unregistered Customer',
    shortName: 'Guest',
    description: 'Walk-in or online visitor who can view product details, upload print jobs, or sign up.',
    badgeClass: 'badge bg-secondary-subtle text-secondary border border-secondary-subtle',
    isStaff: false,
    isAdmin: false,
    canBeCreatedByAdmin: false,
  },
});

/**
 * Normalizes legacy or variant role strings into one of the 4 standard roles.
 * E.g. 'SALES', 'PRODUCTION', 'INVENTORY', 'MANAGER', 'STAFF' -> 'WORKER'
 */
function normalizeRole(role) {
  if (!role) return ROLES.GUEST;
  const upper = String(role).trim().toUpperCase();

  if (upper === 'ADMIN' || upper === 'OWNER') {
    return ROLES.ADMIN;
  }
  if (upper === 'CUSTOMER' || upper === 'CLIENT') {
    return ROLES.CUSTOMER;
  }
  if (upper === 'GUEST' || upper === 'VISITOR' || upper === 'ANONYMOUS') {
    return ROLES.GUEST;
  }
  // Store worker roles (current and legacy)
  if ([
    'WORKER',
    'STAFF',
    'SALES',
    'PRODUCTION',
    'INVENTORY',
    'ACCOUNTANT',
    'MANAGER',
    'OPERATOR',
    'CASHIER'
  ].includes(upper)) {
    return ROLES.WORKER;
  }

  return ROLES.WORKER;
}

/**
 * Check if a role belongs to store staff (Owner/Admin or Worker)
 */
function isStaff(role) {
  const norm = normalizeRole(role);
  return norm === ROLES.ADMIN || norm === ROLES.WORKER;
}

/**
 * Check if a role has owner/admin privileges
 */
function isAdmin(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

/**
 * Check if a role is a registered regular customer
 */
function isCustomer(role) {
  return normalizeRole(role) === ROLES.CUSTOMER;
}

/**
 * Get human-readable label for a role
 */
function getRoleLabel(role) {
  const norm = normalizeRole(role);
  return ROLE_DEFINITIONS[norm] ? ROLE_DEFINITIONS[norm].name : 'Store Worker';
}

/**
 * Get badge markup class for a role
 */
function getRoleBadgeClass(role) {
  const norm = normalizeRole(role);
  return ROLE_DEFINITIONS[norm] ? ROLE_DEFINITIONS[norm].badgeClass : 'badge bg-light text-dark border';
}

module.exports = {
  ROLES,
  ROLE_DEFINITIONS,
  normalizeRole,
  isStaff,
  isAdmin,
  isCustomer,
  getRoleLabel,
  getRoleBadgeClass,
};

