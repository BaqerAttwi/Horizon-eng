const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLES, ROLE_PERMISSIONS, canViewPrices, canManageWorkflow, canExportProjectFinancials, isRoleAllowed,
} = require('../utils/rolePolicy');

test('every supported role has an explicit permission set', () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), [...ROLES].sort());
  for (const role of ROLES) assert.ok(Array.isArray(ROLE_PERMISSIONS[role]));
});

test('owner inherits every managed application area', () => {
  const owner = new Set(ROLE_PERMISSIONS.owner);
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    if (role === 'technician') continue;
    for (const permission of permissions) assert.ok(owner.has(permission), `owner missing ${permission} from ${role}`);
  }
});

test('price visibility is denied to operational-only roles', () => {
  assert.equal(canViewPrices('owner'), true);
  assert.equal(canViewPrices('head_engineer'), true);
  assert.equal(canViewPrices('accounting'), true);
  for (const role of ['engineer','stock_manager','secretary','technician']) assert.equal(canViewPrices(role), false);
});

test('only owner and head engineer can manage later workflow stages', () => {
  for (const role of ROLES) assert.equal(canManageWorkflow(role), ['owner','head_engineer'].includes(role));
});

test('financial project exports are management/accounting only', () => {
  for (const role of ROLES) {
    assert.equal(canExportProjectFinancials(role), ['owner','head_engineer','accounting'].includes(role));
  }
});

test('route authorization allows and denies every role correctly', () => {
  for (const role of ROLES) {
    const allowed = ['owner','head_engineer'].includes(role);
    assert.equal(isRoleAllowed(role, ['owner','head_engineer']), allowed, role);
  }
});
