import { useUnsavedChange } from '../context/UnsavedChangesContext';
import { useEffect, useState } from 'react';

export default function ItemNoteEditor({ value, label, onSave }) {
  const [draft,setDraft] = useState(value || '');
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(value || '');
  useEffect(()=>{ setDraft(current=>current === saved ? (value || '') : current); setSaved(value || ''); },[value]);
  const save = async()=>{
    setSaving(true);
    setError('');
    try { if (await onSave(draft) === false) return false; setSaved(draft); return true; }
    catch(e) { setError(e.message || 'Could not save note. Please retry.'); return false; }
    finally { setSaving(false); }
  };
  useUnsavedChange({ dirty: draft !== saved, label, save, discard: ()=>setDraft(saved), busy: saving });
  return <div className="item-note-editor" onClick={e=>e.stopPropagation()}>
    <textarea className="form-input" rows={2} maxLength={5000} aria-label={label} placeholder="Leave an item note…" value={draft} disabled={saving} onChange={e=>setDraft(e.target.value)} />
    {draft !== saved && <small className="unsaved-indicator">Unsaved changes</small>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn btn-sm btn-secondary" disabled={saving || draft===saved} onClick={save}>{saving ? 'Saving…' : 'Save note'}</button>
  </div>;
}
