const db = require('../db/connection');
const { logActivity } = require('./activityController');

// A project's total_with_vat (falling back to total_price) is what's
// actually owed — VAT-inclusive if VAT applies, matching what the client
// is actually invoiced.
async function getProjectDue(projectId) {
  const [[project]] = await db.execute(
    'SELECT total_price, total_with_vat FROM projects WHERE id=?',
    [projectId]
  );
  if (!project) return null;
  const due = parseFloat(project.total_with_vat) || parseFloat(project.total_price) || 0;
  return due;
}

async function getProjectPayments(req, res, next) {
  try {
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [payments] = await db.execute(
      `SELECT pp.*, w.name as recorded_by_name
       FROM project_payments pp
       LEFT JOIN workers w ON pp.recorded_by = w.id
       WHERE pp.project_id = ?
       ORDER BY pp.payment_date DESC, pp.id DESC`,
      [req.params.projectId]
    );

    const [[project]] = await db.execute('SELECT payment_deadline FROM projects WHERE id=?', [req.params.projectId]);
    const due = await getProjectDue(req.params.projectId);
    const paid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    res.json({
      payments,
      total_due: due,
      total_paid: paid,
      outstanding: Math.max(0, (due || 0) - paid),
      payment_deadline: project?.payment_deadline || null,
    });
  } catch (err) { next(err); }
}

async function addPayment(req, res, next) {
  try {
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const { amount, payment_date, method, notes, next_payment_deadline } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
    if (!payment_date) return res.status(400).json({ error: 'payment_date is required' });

    const [result] = await db.execute(
      `INSERT INTO project_payments (project_id, amount, payment_date, method, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.projectId, amt, payment_date, method || null, notes || null, req.worker.id]
    );

    logActivity({
      project_id: req.params.projectId, action: 'payment_recorded',
      field_name: 'payment', new_value: `$${amt.toFixed(2)}${method ? ' via ' + method : ''}`,
      performed_by: req.worker.id
    });

    // Setting a deadline for the *next* payment is part of recording this
    // one, not a separate admin action — e.g. paying installment 2 of 4 is
    // also where you say when installment 3 is due. Once the project is
    // fully paid there's nothing left to remind about, so clear it instead.
    const due = await getProjectDue(req.params.projectId);
    const [[{ paidSoFar }]] = await db.execute(
      "SELECT COALESCE(SUM(amount),0) as paidSoFar FROM project_payments WHERE project_id=?",
      [req.params.projectId]
    );
    const stillOwed = Math.max(0, (due || 0) - parseFloat(paidSoFar));
    if (stillOwed <= 0.01) {
      await db.execute('UPDATE projects SET payment_deadline=NULL WHERE id=?', [req.params.projectId]);
    } else if (next_payment_deadline !== undefined) {
      await db.execute('UPDATE projects SET payment_deadline=? WHERE id=?', [next_payment_deadline || null, req.params.projectId]);
    }

    const [[payment]] = await db.execute(
      `SELECT pp.*, w.name as recorded_by_name
       FROM project_payments pp
       LEFT JOIN workers w ON pp.recorded_by = w.id
       WHERE pp.id = ?`,
      [result.insertId]
    );
    res.status(201).json(payment);
  } catch (err) { next(err); }
}

async function deletePayment(req, res, next) {
  try {
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [[payment]] = await db.execute(
      'SELECT amount FROM project_payments WHERE id=? AND project_id=?',
      [req.params.paymentId, req.params.projectId]
    );
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    await db.execute('DELETE FROM project_payments WHERE id=? AND project_id=?', [req.params.paymentId, req.params.projectId]);

    logActivity({
      project_id: req.params.projectId, action: 'payment_deleted',
      field_name: 'payment', old_value: `$${(parseFloat(payment.amount) || 0).toFixed(2)}`,
      performed_by: req.worker.id
    });

    res.json({ message: 'Payment deleted' });
  } catch (err) { next(err); }
}

// ── Debt overview (owner/accounting only) — every approved project that
// still owes money, with its payment history summarized and its payment
// deadline, for the sidebar Debt page.
async function getDebtOverview(req, res, next) {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM (
        SELECT p.id, p.project_name, p.status, p.deadline, p.payment_deadline,
          c.name as client_name, w.name as engineer_name,
          COALESCE(NULLIF(p.total_with_vat,0), p.total_price) as total_due,
          COALESCE(pay.paid, 0) as total_paid,
          GREATEST(0, COALESCE(NULLIF(p.total_with_vat,0), p.total_price) - COALESCE(pay.paid,0)) as outstanding,
          pay.last_payment_date
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN workers w ON w.id = p.engineer_id
        LEFT JOIN (
          SELECT project_id, SUM(amount) as paid, MAX(payment_date) as last_payment_date
          FROM project_payments GROUP BY project_id
        ) pay ON pay.project_id = p.id
        WHERE p.deleted_at IS NULL
          AND p.admin_approval = 'approved' AND p.client_approval = 'approved'
      ) t
      WHERE t.outstanding > 0.01
      ORDER BY
        CASE WHEN t.payment_deadline IS NOT NULL AND t.payment_deadline < CURDATE() THEN 0 ELSE 1 END,
        t.payment_deadline ASC,
        t.outstanding DESC
    `);
    const totalOutstanding = rows.reduce((s, r) => s + (parseFloat(r.outstanding) || 0), 0);
    res.json({ projects: rows, total_outstanding: totalOutstanding });
  } catch (err) { next(err); }
}

module.exports = { getProjectPayments, addPayment, deletePayment, getProjectDue, getDebtOverview };
