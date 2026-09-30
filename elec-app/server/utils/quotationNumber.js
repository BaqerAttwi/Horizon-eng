function generateQuotationNumber(name, id, createdAt = new Date()) {
  const projectName = String(name || 'Project').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Project';
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const datePart = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
  return 'EQ-' + projectName + '-' + datePart + '-' + id;
}
module.exports = { generateQuotationNumber };
