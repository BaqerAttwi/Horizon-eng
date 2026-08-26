const ROLES = ['owner', 'head_engineer', 'stock_manager', 'accounting', 'engineer', 'secretary', 'technician'];
const MANAGEMENT_ROLES = ['owner', 'head_engineer'];
const PRICE_HIDDEN_ROLES = ['engineer', 'stock_manager', 'secretary', 'technician'];
const PROJECT_FINANCIAL_EXPORT_ROLES = ['owner', 'head_engineer', 'accounting'];
const ROLE_PERMISSIONS = {
  owner: ['products','upload','projects','workers','clients','reservations','reports','discounts','requests','analytics','item-groups','messages','debt','procurement'],
  accounting: ['products','projects','clients','reservations','reports','debt'],
  engineer: ['products','projects','reservations','requests','item-groups','messages','clients'],
  head_engineer: ['products','projects','workers','clients','reservations','reports','requests','discounts','item-groups','messages','procurement'],
  stock_manager: ['products','reservations','reports','procurement'],
  secretary: ['products','clients','reservations','messages'],
  technician: ['execution'],
};

const canViewPrices = role => !PRICE_HIDDEN_ROLES.includes(role);
const canManageWorkflow = role => MANAGEMENT_ROLES.includes(role);
const canExportProjectFinancials = role => PROJECT_FINANCIAL_EXPORT_ROLES.includes(role);
const isRoleAllowed = (role, allowedRoles) => allowedRoles.includes(role);

module.exports = {
  ROLES,
  MANAGEMENT_ROLES,
  PRICE_HIDDEN_ROLES,
  PROJECT_FINANCIAL_EXPORT_ROLES,
  ROLE_PERMISSIONS,
  canViewPrices,
  canManageWorkflow,
  canExportProjectFinancials,
  isRoleAllowed,
};
