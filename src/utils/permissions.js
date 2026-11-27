// Single source of truth for the permission catalog and default roles.
// Used by the seed script. Later phases only reference these keys in routes.

const ROLE_NAMES = {
  ADMIN: 'Admin',
  SALES: 'Sales Executive',
  CUSTOMER: 'Customer',
};

const p = (key, description) => ({ key, description, group: key.split(':')[0] });

const PERMISSION_CATALOG = [
  // Administration
  p('staff:read', 'View staff and user accounts'),
  p('staff:create', 'Create staff and user accounts'),
  p('staff:update', 'Edit staff and user accounts'),
  p('staff:delete', 'Deactivate staff and user accounts'),
  p('staff:assign-role', 'Assign or revoke a user role'),
  p('roles:read', 'View roles'),
  p('roles:create', 'Create roles'),
  p('roles:update', 'Edit roles'),
  p('roles:delete', 'Delete roles'),
  p('roles:manage-permissions', 'Grant or revoke permissions on roles'),
  p('permissions:read', 'View permissions'),
  p('permissions:create', 'Create permissions'),
  p('permissions:update', 'Edit permissions'),
  p('permissions:delete', 'Delete permissions'),
  // Catalog and inventory (Phase 2/3)
  p('products:create', 'Create products'),
  p('products:update', 'Edit products'),
  p('products:delete', 'Delete products'),
  p('categories:create', 'Create categories'),
  p('categories:update', 'Edit categories'),
  p('categories:delete', 'Delete categories'),
  p('inventory:read', 'View inventory and stock levels'),
  p('inventory:update', 'Adjust stock levels'),
  // Orders (Phase 2/3)
  p('orders:read-all', 'View all customer orders'),
  p('orders:update-status', 'Change order status, including cancellation'),
  p('orders:own', 'Place and view own orders'),
  // CRM (Phase 3)
  p('leads:read', 'View leads'),
  p('leads:update', 'Update lead status and notes'),
  p('leads:delete', 'Delete leads'),
  p('leads:followups', 'Manage and view follow-ups'),
  // Dashboard (Phase 3)
  p('dashboard:read', 'View admin dashboard analytics'),
  // Customer store (Phase 2)
  p('store:access', 'Access the customer store'),
  p('cart:own', 'Manage own cart'),
  p('addresses:own', 'Manage own delivery addresses'),
];

const ALL_KEYS = PERMISSION_CATALOG.map((x) => x.key);

const DEFAULT_ROLES = [
  {
    name: ROLE_NAMES.ADMIN,
    description: 'Full access to every module',
    permissions: ALL_KEYS,
  },
  {
    name: ROLE_NAMES.SALES,
    description: 'Can only view and update leads and follow-ups',
    permissions: ['leads:read', 'leads:update', 'leads:followups'],
  },
  {
    name: ROLE_NAMES.CUSTOMER,
    description: 'Store access and own orders only',
    permissions: ['store:access', 'cart:own', 'addresses:own', 'orders:own'],
  },
];

module.exports = { ROLE_NAMES, PERMISSION_CATALOG, DEFAULT_ROLES, ALL_KEYS };
