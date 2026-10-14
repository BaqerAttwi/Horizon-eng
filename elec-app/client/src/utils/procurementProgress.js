export const PROCUREMENT_FILTERS = [
  ['all', 'All'], ['shortages', 'Has shortages'], ['ready', 'Ready for approval'],
  ['rejected', 'Rejected'], ['approved', 'Approved'],
];

export function procurementProgress(project) {
  const items = project.items || [];
  const shortages = items.filter(item => Number(item.shortage_qty) > 0).length;
  const total = items.length;
  const ready = total - shortages;
  return { total, ready, shortages, percent: total ? Math.round(ready / total * 100) : 0 };
}

export function matchesProcurementFilter(project, filter) {
  const { total, shortages } = procurementProgress(project);
  const status = project.procurement_status || 'pending';
  switch (filter) {
    case 'shortages': return shortages > 0;
    case 'ready': return total > 0 && shortages === 0 && status === 'pending';
    case 'rejected': return status === 'rejected';
    case 'approved': return status === 'approved';
    default: return true;
  }
}
