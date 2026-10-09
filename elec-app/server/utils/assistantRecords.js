const { ROLE_PERMISSIONS, MANAGEMENT_ROLES } = require('./rolePolicy');

function todayInBeirut(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Beirut', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function recordIntent(message, previousTopic) {
  const text = message.toLowerCase().normalize('NFKC').replace(/w3hat/g, 'what').replace(/\b(tody|todya|todays)\b/g, 'today');
  if (/\b(ignore .*instructions|system prompt|bypass|sql|token|secret|hack)\b/.test(text)) return null;
  if (previousTopic === 'conversation:daily' && /^(yes|yeah|yep|sure|okay|ok|please|let'?s go|go ahead)[!?.\s]*$/.test(text.trim())) return 'daily';
  if (/^(let'?s (get to|go to|start) work|show my work today|yes,? show my work today)[!?.\s]*$/.test(text.trim())) return 'daily';
  if (/\b(how|steps|guide|tutorial)\b/.test(text)) return null;
  if (/\b(show|check|list|any|what|have)\b/.test(text)) {
    if (/\b(approval|approvals|recheck|reviews)\b/.test(text)) return 'approvals';
    if (/\b(requests?|invitations?)\b/.test(text)) return 'requests';
    if (/\b(payments?|balances?|owed|outstanding|debt)\b/.test(text)) return 'debt';
    if (/\b(stock|shortages?|inventory|procurement)\b/.test(text)) return 'stock';
  }
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
  if (!permissions || !['daily','projects','stock','debt','clients','approvals','requests'].includes(intent)) return null;
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
  if (intent === 'approvals' && !(management || worker.role === 'engineer')) return denied();
  if (intent === 'requests' && !can('requests')) return denied();

  if ((intent === 'daily' && (can('projects') || technician || stockManager)) || intent === 'projects' || (intent === 'approvals' && worker.role === 'engineer')) {
    let scope = '', args = [];
    if (worker.role === 'engineer') {
      scope = ` AND (p.engineer_id=? OR EXISTS (SELECT 1 FROM project_engineer_requests er WHERE er.project_id=p.id AND er.target_engineer_id=? AND er.status='accepted'))`;
      args = [worker.id, worker.id];
    } else if (technician) {
      scope = ' AND EXISTS (SELECT 1 FROM project_technicians pt WHERE pt.project_id=p.id AND pt.worker_id=?)';
      args = [worker.id];
    } else if (stockManager) scope = " AND p.project_stage='procurement'";
    if (intent === 'approvals') scope += " AND (p.admin_approval IN ('recheck','rejected') OR (p.admin_approval='pending' AND p.ready_for_review=TRUE))";
    const name = intent === 'projects' ? searchName(message, 'project') : null;
    if (name) { scope += " AND p.project_name LIKE ? ESCAPE '!'"; args.push(like(name)); }
    const deadline = technician ? 'COALESCE(p.execution_deadline,p.deadline)' : 'p.deadline';
    const [rows] = await db.execute(`SELECT p.id,p.project_name,p.project_stage,p.status,
      DATE_FORMAT(${deadline},'%Y-%m-%d') deadline${management || worker.role === 'engineer' ? ',p.admin_approval,p.ready_for_review,p.rejection_note,p.client_approval' : ''}
      FROM projects p WHERE p.deleted_at IS NULL AND p.status NOT IN ('completed','cancelled')
      AND COALESCE(p.project_stage,'design')<>'delivered' ${scope}
      ORDER BY CASE WHEN ${deadline} < ? THEN 0 WHEN ${deadline} = ? THEN 1 ELSE 2 END,
      ${deadline} IS NULL,${deadline} ASC,p.updated_at DESC LIMIT 11`, [...args,today,today]);
    const title = technician || worker.role === 'engineer' ? 'Your open assigned projects (including earlier work)' : stockManager ? 'Projects in procurement' : 'Open projects';
    const lines = rows.slice(0,10).map(p => {
      const deadlineLabel = !p.deadline ? 'no deadline set' : p.deadline < today ? `OVERDUE since ${p.deadline}` : p.deadline === today ? 'DUE TODAY' : `due ${p.deadline}`;
      const review = p.admin_approval === 'recheck' || p.admin_approval === 'rejected' ? `needs edits${p.rejection_note ? ': '+safeText(p.rejection_note) : ''}` : p.admin_approval === 'approved' ? 'management approved' : p.ready_for_review ? 'waiting for management approval' : 'not submitted for approval';
      const approvals = management || worker.role === 'engineer' ? ` · ${review}${management ? ' · client '+safeText(p.client_approval) : ''}` : '';
      const id = numericId(p.id);
      if (id) addLink(p.project_name, technician ? `/my-projects/${id}` : stockManager ? `/procurement?project=${id}` : `/projects/${id}/crm`);
      const next = technician ? 'Open assigned tasks; record actual completion and testing.' : stockManager ? 'Check shortages and allocation before procurement approval.' : worker.role === 'engineer' ? (p.admin_approval==='recheck' || p.admin_approval==='rejected' ? 'Read the notes, make corrections and resubmit.' : p.admin_approval==='approved' ? 'Check the approved stage and continue your authorized work.' : p.ready_for_review ? 'Wait for the review decision; check Requests for collaboration replies.' : 'Finish the design and submit for management approval.') : management ? (p.ready_for_review && p.admin_approval==='pending' ? 'Review the CRM and record an approval, recheck or cancellation decision.' : 'Check the responsible team and blockers before advancing the stage.') : 'Review payment history and the expected payment date.';
      return `• #${id || '?'} ${safeText(p.project_name)} — ${safeText(p.project_stage || 'design')} · ${deadlineLabel}${approvals}\n  Next: ${next}`;
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
    const [rows] = await db.execute(`SELECT p.id,p.project_name,DATE_FORMAT(p.payment_deadline,'%Y-%m-%d') payment_deadline,
      GREATEST(0,COALESCE(NULLIF(p.total_with_vat,0),p.total_price)-COALESCE((SELECT SUM(pp.amount) FROM project_payments pp WHERE pp.project_id=p.id),0)) outstanding_balance
      FROM projects p WHERE p.deleted_at IS NULL AND p.status<>'cancelled'
      HAVING outstanding_balance>0 ORDER BY outstanding_balance DESC,p.id ASC LIMIT 11`);
    sections.push(`Outstanding project balances (not necessarily overdue):\n${rows.slice(0,10).map(p => {
      const id = numericId(p.id); if (id) addLink(p.project_name,`/projects/${id}/crm`);
      return `• #${id || '?'} ${safeText(p.project_name)} — $${Number(p.outstanding_balance).toFixed(2)}${p.payment_deadline ? (p.payment_deadline < today ? ' · PAYMENT OVERDUE since ' : p.payment_deadline === today ? ' · PAYMENT DUE TODAY: ' : ' · payment due ') + p.payment_deadline : ' · no payment date set'}`;
    }).join('\n') || 'No outstanding project balances found.'}${rows.length>10 ? '\nShowing the first 10.' : ''}`);
    addLink('Debt','/debt');
  }

  if (intent === 'clients' || (intent === 'daily' && worker.role === 'secretary')) {
    const name = intent === 'clients' ? searchName(message,'client') : null;
    const [rows] = await db.execute(`SELECT id,name FROM clients WHERE deleted_at IS NULL ${name ? "AND name LIKE ? ESCAPE '!'" : ''} ORDER BY id DESC LIMIT 11`, name ? [like(name)] : []);
    sections.push(`Client ${name ? 'matches' : 'records (most recently added; these are not assigned tasks)'}:\n${rows.slice(0,10).map(c => `• ${safeText(c.name)}`).join('\n') || 'No matching clients found.'}${rows.length>10 ? '\nShowing the first 10.' : ''}`);
    addLink('Clients','/clients');
  }

  if (['daily','approvals','requests'].includes(intent) && !technician) {
    if (management && intent !== 'requests') {
      const [reviews] = await db.execute(`SELECT id,project_name FROM projects WHERE deleted_at IS NULL AND status NOT IN ('completed','cancelled') AND ready_for_review=TRUE AND admin_approval='pending' ORDER BY updated_at ASC,id ASC LIMIT 11`);
      sections.push(`Waiting for your management review:\n${reviews.slice(0,10).map(p => { const id=numericId(p.id); if(id) addLink('Review '+safeText(p.project_name),'/projects/'+id+'/crm'); return '• #'+(id || '?')+' '+safeText(p.project_name)+' — approve, request recheck, or cancel with notes'; }).join('\n') || 'No submitted projects waiting for management approval.'}${reviews.length>10 ? '\nShowing the first 10; check Projects for the rest.' : ''}`);
    }
    if ((management || worker.role === 'engineer') && intent !== 'requests') {
      const [manual] = await db.execute(`SELECT status,COUNT(*) request_count FROM manual_product_requests WHERE (? IN ('owner','head_engineer') OR created_by=?) GROUP BY status`,[worker.role,worker.id]);
      const pending = manual.find(row=>row.status==='pending');
      sections.push(`${management ? 'Manual product requests awaiting review' : 'Your manual product requests awaiting approval'}: ${Number(pending?.request_count) || 0}.`);
      addLink('Manual product requests','/products');
    }
    if(intent === 'daily') {
      const [[row]] = await db.execute('SELECT COUNT(*) unread_count FROM notifications WHERE user_id=? AND is_read=FALSE',[worker.id]);
      sections.push(`You have ${Number(row.unread_count) || 0} unread notifications.`);
      addLink('Notifications','/notifications');
    }
    if (can('requests') && intent !== 'approvals') {
      const [[requests]] = await db.execute(`SELECT COUNT(*) pending_count FROM project_engineer_requests er JOIN projects p ON p.id=er.project_id WHERE er.target_engineer_id=? AND er.status='pending' AND p.deleted_at IS NULL`,[worker.id]);
      sections.push(`You have ${Number(requests.pending_count) || 0} pending collaboration invitations.`);
      const [invitations] = await db.execute(`SELECT er.project_id,p.project_name,w.name sender_name FROM project_engineer_requests er JOIN projects p ON p.id=er.project_id LEFT JOIN workers w ON w.id=er.requested_by WHERE er.target_engineer_id=? AND er.status='pending' AND p.deleted_at IS NULL ORDER BY er.id DESC LIMIT 10`,[worker.id]);
      if(invitations.length) sections.push('Incoming invitations:\n'+invitations.map(r => `• Project #${numericId(r.project_id) || '?'} ${safeText(r.project_name)} — from ${safeText(r.sender_name)}; accept or reject in Requests`).join('\n'));
      const [sent] = await db.execute(`SELECT er.project_id,p.project_name,er.status,w.name target_name FROM project_engineer_requests er JOIN projects p ON p.id=er.project_id LEFT JOIN workers w ON w.id=er.target_engineer_id WHERE er.requested_by=? AND p.deleted_at IS NULL ORDER BY er.id DESC LIMIT 10`,[worker.id]);
      if(sent.length) sections.push('Recent collaboration requests you sent:\n'+sent.map(r => `• Project #${numericId(r.project_id) || '?'} ${safeText(r.project_name)} — ${safeText(r.target_name)}: ${safeText(r.status)}`).join('\n'));
      addLink('Requests','/requests');
    }
  }
  const focus = {
    owner:'Start with submitted approvals and overdue commitments. Then review payment dates, shortages and team assignments.',
    head_engineer:'Start with submitted reviews and engineering blockers. Coordinate collaboration, procurement readiness and testing before advancing stages.',
    engineer:'Start with recheck notes and overdue designs. Check invitations, finish your assigned work and submit for approval; wait for the decision before Quotation.',
    accounting:'Start with overdue payment dates. Verify payment history before following up or recording a payment; set a date for any remaining balance.',
    stock_manager:'Start with shortages in procurement. Verify actual stock and allocations before approving readiness; allocations do not add warehouse stock.',
    secretary:'Start with unread alerts and contact records that need checking. Verify client details and coordinate deadlines through Calendar and Announcements.',
    technician:'Start with overdue assigned work. Update completed tasks accurately, record test results and report blockers to the responsible engineer.',
  };
  const suggestions=[{label:'Refresh'},{label:'My role and tools'}];
  if(management || worker.role==='engineer') suggestions.push({label:'Show pending approvals'});
  if(can('requests')) suggestions.push({label:'Show my requests'});
  if(can('debt')) suggestions.push({label:'Show outstanding payments'});
  if(stockManager || management) suggestions.push({label:'Show stock shortages'});
  if(technician) suggestions.push({label:'Show my assignments'});
  if(worker.role==='secretary') suggestions.push({label:'Show clients'});
  return { reply:`${safeText(worker.name)}, here is your live ${intent === 'daily' ? 'work overview' : intent+' summary'} as of ${today} (Beirut).\n\n${intent==='daily' ? focus[worker.role]+'\n\n' : ''}${sections.join('\n\n')}\n\n${intent==='daily' ? 'Open work includes earlier assignments. This is a current snapshot; use the links to review and act.' : 'Use the links below to review the full records.'}`, links, suggestions, topic:`records:${intent}` };
}
module.exports = { readRecords, recordIntent, todayInBeirut };
