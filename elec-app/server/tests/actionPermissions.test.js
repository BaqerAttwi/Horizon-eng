const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const permissions = import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/actionPermissions.js')).href);

test('client buttons use the same edit/delete roles as the API',async()=>{
  const {canEditClients,canDeleteClients}=await permissions;
  for(const role of ['owner','head_engineer','accounting','secretary','engineer','stock_manager','technician','unknown']) {
    assert.equal(canEditClients(role),['owner','head_engineer','accounting','secretary','engineer'].includes(role),role);
    assert.equal(canDeleteClients(role),['owner','head_engineer'].includes(role),role);
  }
});
test('accounting can never edit or submit project work, and canceled projects are read only',async()=>{
  const {canWriteProjects,canEditProject,canProgressProject}=await permissions;
  for(const role of ['owner','head_engineer','accounting','secretary','engineer','stock_manager','technician','unknown']) {
    assert.equal(canWriteProjects(role),['owner','head_engineer','engineer'].includes(role),role);
    for(const project of [{status:'cancelled'},{status:'active',admin_approval:'cancelled'}]) {
      assert.equal(canEditProject(role,project),false);assert.equal(canProgressProject(role,project),false);
    }
    if(!canWriteProjects(role)) { assert.equal(canEditProject(role,{}),false);assert.equal(canProgressProject(role,{}),false); }
  }
});
test('approved engineer work allows execution but blocks commercial edits; pending review blocks both',async()=>{
  const {canEditProject,canProgressProject}=await permissions;
  const approved={status:'active',client_approval:'approved'};
  assert.equal(canEditProject('engineer',approved),false);
  assert.equal(canProgressProject('engineer',approved),true);
  const submitted={ready_for_review:1,admin_approval:'pending'};
  assert.equal(canEditProject('engineer',submitted),false);assert.equal(canProgressProject('engineer',submitted),false);
  for(const role of ['owner','head_engineer']) { assert.equal(canEditProject(role,submitted),true);assert.equal(canProgressProject(role,approved),true); }
});
