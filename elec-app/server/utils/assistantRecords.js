const { ROLE_PERMISSIONS, MANAGEMENT_ROLES } = require('./rolePolicy');

function todayInBeirut(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Beirut', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function recordIntent(message, previousTopic) {
  const text = message.toLowerCase().normalize('NFKC').replace(/w3hat/g, 'what').replace(/tody/g, 'today');
  if (/\b(ignore .*instructions|system prompt|bypass|sql|token|secret|hack)\b/.test(text)) return null;
  if (/\b(today|tomorrow|overdue|my work|my tasks|my assignments|what do i have|what i have|what have i got|what should i do|daily|to do|todo|pending work)\b/.test(text)) return 'daily';
  if (/\b(how|steps|guide|tutorial)\b/.test(text)) return null;
  if (/\b(show|list|find|search|which|what|any|check|have|status|balance)\b/.test(text)) {
    if (/\b(projects?|assignments?|deadlines?)\b/.test(text)) return 'projects';
    if (/\b(stock|products?|shortages?|inventory|procurement)\b/.test(text)) return 'stock';
    if (/\b(debt|payments?|balances?|owed|outstanding)\b/.test(text)) return 'debt';
    if (/\b(clients?|customers?)\b/.test(text)) return 'clients';
  }
  if (/^(more|refresh|check again|show me)[!?.\s]*$/.test(text) && previousTopic?.startsWith('records:')) return previousTopic.slice(8);
  return null;
}
const safeText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180);
const numericId = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : null;
const like = value => `%${value.replace(/[!%_]/g, c => '!'+c)}%`;
function searchName(message, noun) {
  // Explicit quoted names keep conversational text out of SQL search patterns.
  const quoted = message.match(/["“]([^"”]{1,100})["”]/);
  if (quoted) return quoted[1];
  const match = message.match(new RegExp(`(?:find|search)\\s+(?:${noun}s?\\s+)?(.{1,100})$`, 'i'));
  return match?.[1]?.trim();
}

async function readRecords(db, worker, intent, message, now = new Date()) {
  const permissions = ROLE_PERMISSIONS[worker.role];
  if (!permissions || !['daily','projects','stock','debt','clients'].includes(intent)) return null;
  const management = MANAGEMENT_ROLES.includes(worker.role);
  const technician = worker.role === 'technician';
  const stockManager = worker.role === 'stock_manager';
  const today = todayInBeirut(now);
  const sections = [], links = [];
  const addLink = (label, path) => { if (!links.some(l => l.path === path && l.label === label)) links.push({ label:safeText(label), path }); };
  const can = permission => permissions.includes(permission);
  const denied = () => ({ reply:'Those records are outside your role’s access. Ask the owner or head engineer for help.', links:[], suggestions:[], topic:undefined });

  if (intent === 'projects' && !can('projects') && !technician) return denied();
  if (intent === 'stock' && !can('products')) return denied();
  if (intent === 'debt' && !can('debt')) return denied();
  if (intent === 'clients' && !can('clients')) return denied();

  if ((intent === 'daily' && (can('projects') || technician || stockManager)) || intent === 'projects') {
    let scope = '', args = [];
    if (worker.role === 'engineer') {
      scope = ` AND (p.engineer_id=? OR EXISTS (SELECT 1 FROM project_engineer_requests er WHERE er.project_id=p.id AND er.target_engineer_id=? AND er.status='accepted'))`;
      args = [worker.id, worker.id];
    } else if (technician) {
      scope = ' AND EXISTS (SELECT 1 FROM project_technicians pt WHERE pt.project_id=p.id AND pt.worker_id=?)';
      args = [worker.id];
    } else if (stockManager) scope = " AND p.project_stage='procurement'";
    const name = intent === 'projects' ? searchName(message, 'project') : null;
    if (name) { scope += " AND p.project_name LIKE ? ESCAPE '!'"; args.push(like(name)); }
    const deadline = technician ? 'COALESCE(p.execution_deadline,p.deadline)' : 'p.deadline';
    const [rows] = await db.execute(`SELECT p.id,p.project_name,p.project_stage,p.status,
      DATE_FORMAT(${deadline},'%Y-%m-%d') deadline${management ? ',p.admin_approval,p.client_approval' : ''}
      FROM projects p WHERE p.deleted_at IS NULL AND p.status NOT IN ('completed','cancelled')
      AND COALESCE(p.project_stage,'design')<>'delivered' ${scope}
      ORDER BY CASE WHEN ${deadline} < ? THEN 0 WHEN ${deadline} = ? THEN 1 ELSE 2 END,
      ${deadline} IS NULL,${deadline} ASC,p.updated_at DESC LIMIT 11`, [...args,today,today]);
    const title = technician || worker.role === 'engineer' ? 'Your open assigned projects (including earlier work)' : stockManager ? 'Projects in procurement' : 'Open projects';
    const lines = rows.slice(0,10).map(p => {
      const deadlineLabel = !p.deadline ? 'no deadline set' : p.deadline < today ? `OVERDUE since ${p.deadline}` : p.deadline === today ? 'DUE TODAY' : `due ${p.deadline}`;
      const approvals = management ? ` · admin ${safeText(p.admin_approval)} · client ${safeText(p.client_approval)}` : '';
      const id = numericId(p.id);
      if (id) addLink(p.project_name, technician ? `/my-projects/${id}` : stockManager ? `/procurement?project=${id}` : `/projects/${id}/crm`);
      return `• ${safeText(p.project_name)} — ${safeText(p.project_stage || 'design')} · ${deadlineLabel}${approvals}`;
    });
    sections.push(`${title}:\n${lines.join('\n') || 'No matching open projects found.'}${rows.length > 10 ? '\nShowing the first 10; open the project list for the rest.' : ''}`);
  }

  if (intent === 'stock' || (intent === 'daily' && (stockManager || management))) {
    const name = intent === 'stock' ? searchName(message,'product') : null;
    const condition = name ? "(reference LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')" : 'stock_qty<=reserved_qty';
    const [rows] = await db.execute(`SELECT reference,description,stock_qty,reserved_qty FROM products WHERE ${condition} ORDER BY stock_qty-reserved_qty ASC,id ASC LIMIT 11`, name ? [like(name),like(name)] : []);
    sections.push(`Stock ${name ? 'matches' : 'alerts (stock at or below reserved demand)'}:\n${rows.slice(0,10).map(p => `• ${safeText(p.reference)} — stock ${Number(p.stock_qty) || 0}, reserved ${Number(p.reserved_qty) || 0}`).join('\n') || 'No matching stock records.'}${rows.length>10 ? '\nShowing the first 10.' : ''}`);
    addLink('Stock Management','/products');
    if (can('procurement')) addLink('Procurement Queue','/procurement');
  }

  if (intent === 'debt' || (intent === 'daily' && (worker.role === 'accounting' || management))) {
    const [rows] = await db.execute(`SELECT p.id,p.project_name,
      GREATEST(0,COALESCE(NULLIF(p.total_with_vat,0),p.total_price)-COALESCE((SELECT SUM(pp.amount) FROM project_payments pp WHERE pp.project_id=p.id),0)) outstanding_balance
      FROM projects p WHERE p.deleted_at IS NULL AND p.status<>'cancelled'
      HAVING outstanding_balance>0 ORDER BY outstanding_balance DESC,p.id ASC LIMIT 11`);
    sections.push(`Outstanding project balances (not necessarily overdue):\n${rows.slice(0,10).map(p => {
      const id = numericId(p.id); if (id) addLink(p.project_name,`/projects/${id}/crm`);
      return `• ${safeText(p.project_name)} — $${Number(p.outstanding_balance).toFixed(2)}`;
    }).join('\n') || 'No outstanding project balances found.'}${rows.length>10 ? '\nShowing the first 10.' : ''}`);
    addLink('Debt','/debt');
  }

  if (intent === 'clients' || (intent === 'daily' && worker.role === 'secretary')) {
    const name = intent === 'clients' ? searchName(message,'client') : null;
    const [rows] = await db.execute(`SELECT id,name FROM clients WHERE deleted_at IS NULL ${name ? "AND name LIKE ? ESCAPE '!'" : ''} ORDER BY id DESC LIMIT 11`, name ? [like(name)] : []);
    sections.push(`Client ${name ? 'matches' : 'records (most recently added; these are not assigned tasks)'}:\n${rows.slice(0,10).map(c => `• ${safeText(c.name)}`).join('\n') || 'No matching clients found.'}${rows.length>10 ? '\nShowing the first 10.' : ''}`);
    addLink('Clients','/clients');
  }

  if (intent === 'daily' && !technician) {
    const [[row]] = await db.execute('SELECT COUNT(*) unread_count FROM notifications WHERE user_id=? AND is_read=FALSE',[worker.id]);
    sections.push(`You have ${Number(row.unread_count) || 0} unread notifications.`);
    addLink('Notifications','/notifications');
    if (can('requests')) {
      const [[requests]] = await db.execute(`SELECT COUNT(*) pending_count FROM project_engineer_requests er JOIN projects p ON p.id=er.project_id WHERE er.target_engineer_id=? AND er.status='pending' AND p.deleted_at IS NULL`,[worker.id]);
      sections.push(`You have ${Number(requests.pending_count) || 0} pending collaboration invitations.`);
      addLink('Requests','/requests');
    }
  }
  return { reply:`${safeText(worker.name)}, here is your live ${intent === 'daily' ? 'work overview' : 'record summary'} as of ${today} (Beirut).\n\n${sections.join('\n\n')}\n\n${intent==='daily' ? 'Open work is shown even when it was assigned before today. This is a snapshot, not a calendar appointment list.' : 'Use the links below to review the full records.'}`, links, suggestions:[{ label:'What do I have today?' }], topic:`records:${intent}` };
}
module.exports = { readRecords, recordIntent, todayInBeirut };
