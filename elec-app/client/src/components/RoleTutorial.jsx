import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppIcon from './AppIcon';

// Increase this whenever guidance changes; every user will see the new tour once.
export const TUTORIAL_VERSION = 1;

const shared = { title:'Your control center', text:'The dashboard summarizes the work you are allowed to see. Use the colored cards and project progress board to find work that needs attention.', icon:'dashboard', path:'/dashboard' };
const guides = {
  owner: [shared,
    { title:'Manage every project', text:'Open Projects to control CRM details, panels, quantities, quotation versions, assignments, progress and client delivery.', icon:'projects', path:'/projects' },
    { title:'Stock and procurement', text:'Review demand, allocate Available for Project items, approve procurement and monitor stock without double-counting reserved material.', icon:'products', path:'/procurement' },
    { title:'Business controls', text:'Use Analytics, Debt and Brand Discounts for financial oversight. Workers and Clients contain your administration tools.', icon:'analytics', path:'/analytics' }],
  head_engineer: [shared,
    { title:'Coordinate engineering', text:'Projects shows every project and its seven stages. Assign engineers, review their progress, and update project or quotation details.', icon:'projects', path:'/projects' },
    { title:'Control material flow', text:'Review demand and procurement, then allocate project-only availability before work proceeds.', icon:'procurement', path:'/procurement' },
    { title:'Manage the team', text:'You have owner-level working tools, including imports and divisions. You may manage workers, but only the owner can delete users.', icon:'workers', path:'/workers' }],
  engineer: [shared,
    { title:'Work on assigned projects', text:'Open Projects for your assignments. Update panel quantities, item markup or discount, technical details and stage progress.', icon:'projects', path:'/projects' },
    { title:'Pricing stays private', text:'You can apply markup and discount values without seeing confidential prices. Export the technical or client PDF when required.', icon:'discounts', path:'/projects' },
    { title:'Coordinate and report', text:'Use Requests and Announcements to cooperate with your Head Engineer and record blockers or updates.', icon:'requests', path:'/requests' }],
  stock_manager: [
    { title:'Start with demand', text:'Demand Tracker lists required project material. It reflects panel quantities and excludes fulfilled demand.', icon:'demand', path:'/reservations' },
    { title:'Allocate carefully', text:'Available for Project is project-only allocation—it does not increase warehouse stock or reuse material reserved elsewhere.', icon:'procurement', path:'/procurement' },
    { title:'Maintain warehouse stock', text:'Stock Management changes real inventory. Review Stock Alerts for low or unavailable products.', icon:'products', path:'/products' }],
  accounting: [shared,
    { title:'Review financial records', text:'Use authorized project totals, payments, debt and reports to keep balances accurate.', icon:'accounting', path:'/debt' },
    { title:'Track approved work', text:'Project and client records give context for payments and outstanding balances.', icon:'clients', path:'/clients' }],
  secretary: [shared,
    { title:'Organize projects and clients', text:'Maintain client details, project records, schedules and announcements using the sections available to you.', icon:'clients', path:'/clients' },
    { title:'Keep communication visible', text:'Use Requests and Announcements so updates reach the correct team and remain traceable.', icon:'announcements', path:'/messages' }],
  technician: [
    { title:'Your assigned work', text:'My Projects contains only projects assigned to you. Open a project to see the required execution tasks.', icon:'technician', path:'/my-projects' },
    { title:'Progress starts at zero', text:'Mark actual work as it is completed. The progress bar is calculated from completed tasks and should reach 100% only when all work is done.', icon:'analytics', path:'/my-projects' },
    { title:'Finish and report', text:'Record testing and completion details clearly so the engineer can verify the project before delivery.', icon:'procurement', path:'/my-projects' }],
};

export default function RoleTutorial({ worker, openRequest, onCloseRequest }) {
  const navigate = useNavigate();
  const steps = useMemo(() => guides[worker?.role] || [shared], [worker?.role]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const storageKey = worker ? `horizon-tutorial-v${TUTORIAL_VERSION}-${worker.id}-${worker.role}` : '';

  useEffect(() => {
    if (worker && !localStorage.getItem(storageKey)) { setStep(0); setOpen(true); }
  }, [worker, storageKey]);
  useEffect(() => { if (openRequest) { setStep(0); setOpen(true); } }, [openRequest]);

  const close = () => { localStorage.setItem(storageKey, 'seen'); setOpen(false); onCloseRequest?.(); };
  if (!open) return null;
  const item = steps[step];

  return <div className="modal-overlay tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <div className="tutorial-modal">
      <button className="tutorial-close" onClick={close} aria-label="Close tutorial">×</button>
      <div className="tutorial-progress">{steps.map((_, i) => <i key={i} className={i <= step ? 'done' : ''} />)}</div>
      <div className="tutorial-role"><AppIcon name={worker.role} size={17} /> {worker.role.replaceAll('_', ' ')} guide</div>
      <div className="tutorial-visual"><AppIcon name={item.icon} size={38} strokeWidth={1.5} /></div>
      <div className="tutorial-counter">STEP {step + 1} OF {steps.length}</div>
      <h2 id="tutorial-title">{item.title}</h2>
      <p>{item.text}</p>
      <div className="tutorial-actions">
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(v => v - 1)}>Back</button>
        <button className="btn btn-secondary" onClick={() => { close(); navigate(item.path); }}>Open page</button>
        {step < steps.length - 1
          ? <button className="btn btn-primary" onClick={() => setStep(v => v + 1)}>Next</button>
          : <button className="btn btn-primary" onClick={close}>Finish</button>}
      </div>
    </div>
  </div>;
}
