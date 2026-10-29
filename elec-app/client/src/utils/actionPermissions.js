export const canWriteProjects = role => ['owner','head_engineer','engineer'].includes(role);
export const canEditClients = role => ['owner','head_engineer','accounting','secretary','engineer'].includes(role);
export const canDeleteClients = role => ['owner','head_engineer'].includes(role);
export function canEditProject(role, project) {
  if (!canWriteProjects(role) || project?.status === 'cancelled' || project?.admin_approval === 'cancelled') return false;
  return ['owner','head_engineer'].includes(role) || !(project?.client_approval === 'approved' || (project?.ready_for_review && project?.admin_approval === 'pending'));
}
export function canProgressProject(role, project) {
  if (!canWriteProjects(role) || project?.status === 'cancelled' || project?.admin_approval === 'cancelled') return false;
  return ['owner','head_engineer'].includes(role) || !(project?.ready_for_review && project?.admin_approval === 'pending');
}
