import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

const Context = createContext(null);

export function UnsavedChangesProvider({ children }) {
  const entries = useRef(new Map());
  const [, setRevision] = useState(0);
  const [action, setAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const register = useCallback((id, entry) => {
    entries.current.set(id, entry);
    setRevision(v => v + 1);
    return () => { entries.current.delete(id); setRevision(v => v + 1); };
  }, []);
  const blocker = useBlocker(() => entries.current.size > 0);
  const confirmAction = useCallback(fn => {
    if (!entries.current.size) { fn(); return; }
    setError('');
    setAction(() => fn);
  }, []);
  useEffect(() => {
    const warn = event => {
      if (!entries.current.size) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const finish = () => {
    setError('');
    if (action) { const fn = action; setAction(null); fn(); }
    else if (blocker.state === 'blocked') blocker.proceed();
  };
  const stay = () => {
    setAction(null); setError('');
    if (blocker.state === 'blocked') blocker.reset();
  };
  const saveAll = async () => {
    setSaving(true); setError('');
    try {
      // Save sequentially: multiple fields may belong to the same project lock.
      for (const entry of [...entries.current.values()]) {
        if (await entry.save() === false) {
          setError('Some changes could not be saved. Correct them or keep editing.');
          return;
        }
      }
      finish();
    } catch (e) { setError(e.message || 'Could not save changes. Your edits are still here.'); }
    finally { setSaving(false); }
  };
  const discard = () => {
    for (const entry of entries.current.values()) entry.discard();
    finish();
  };
  const canSaveAll = [...entries.current.values()].every(entry => entry.canSave);
  const busy = [...entries.current.values()].some(entry => entry.busy);
  const value = useMemo(() => ({ register, confirmAction }), [register, confirmAction]);
  return <Context.Provider value={value}>
    {children}
    {(action || blocker.state === 'blocked') && <div className="modal-overlay">
      <section className="modal unsaved-changes-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-title" onKeyDown={event=>{
          if(event.key==='Escape' && !saving) { event.preventDefault(); stay(); }
          if(event.key==='Tab') {
            const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled)')];
            const first=buttons[0],last=buttons[buttons.length-1];
            if(event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
            else if(!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <div className="modal-header"><strong id="unsaved-title">Unsaved changes</strong></div>
        <div className="modal-body">
          <p>Save your changes before leaving, discard them, or keep editing.</p>
          <ul>{[...entries.current.entries()].map(([id,entry]) => <li key={id}>{entry.label}</li>)}</ul>
          {(saving || busy) && <p role="status">Saving changes…</p>}
          {!canSaveAll && <p>Complete pending actions using their buttons on the page, or discard their entered values. They will not be submitted automatically.</p>}
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" disabled={saving} onClick={stay} autoFocus>Keep editing</button>
          <button className="btn btn-danger" disabled={saving || busy} onClick={discard}>Discard changes</button>
          <button className="btn btn-primary" disabled={saving || busy || !canSaveAll} onClick={saveAll}>Save and continue</button>
        </div>
      </section>
    </div>}
  </Context.Provider>;
}

export function useUnsavedChange({ dirty, label, save, discard, busy = false }) {
  const context = useContext(Context);
  const id = useId();
  const callbacks = useRef({ save, discard });
  callbacks.current = { save, discard };
  const register = context?.register;
  const canSave = typeof save === 'function';
  useEffect(() => {
    if (!dirty || !register) return;
    return register(id, { label, busy, canSave, save: () => callbacks.current.save(), discard: () => callbacks.current.discard() });
  }, [dirty, register, id, label, busy, canSave]);
}

export function useConfirmUnsaved() {
  return useContext(Context)?.confirmAction || (fn => fn());
}
