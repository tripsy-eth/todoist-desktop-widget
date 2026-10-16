import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createTaskPayload, emptyDraft, type TaskDraft } from "./task-form";
import type { Task } from "./tasks";

export type Project = { id: string; name: string; is_shared?: boolean; inbox_project?: boolean; is_inbox_project?: boolean; is_archived?: boolean; is_deleted?: boolean };
export type Options = { projects: Project[]; sections: { id: string; project_id: string; name: string }[]; labels: { id: string; name: string }[] };
type Collaborator = { id: string | number; name?: string; full_name?: string; email?: string };

export function TaskComposer({ title, tasks, onCancel, onCreated }: {
  title: string; tasks: Task[]; onCancel: () => void; onCreated: (message: string, warning: string | null) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({ ...emptyDraft, content: title });
  const [options, setOptions] = useState<Options | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) { setDraft(old => ({ ...old, [key]: value })); }
  async function loadOptions() {
    setLoading(true); setError("");
    try {
      const result = await invoke<Options>("get_task_options");
      setOptions(result);
      const inbox = result.projects.find(p => p.inbox_project || p.is_inbox_project);
      if (inbox) setDraft(old => old.project ? old : { ...old, project: inbox.id });
    }
    catch (e) { setError(`Could not load projects and labels: ${String(e)}`); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadOptions(); }, []);
  const selectedProject = options?.projects.find(project => project.id === draft.project);
  useEffect(() => {
    let active = true;
    setCollaborators([]); setPeopleError(""); setPeopleLoading(false);
    if (selectedProject?.is_shared) {
      setPeopleLoading(true);
      invoke<Collaborator[]>("get_collaborators", { projectId: selectedProject.id })
        .then(people => { if (active) setCollaborators(people); })
        .catch(e => { if (active) setPeopleError(`Assignees unavailable: ${String(e)}`); })
        .finally(() => { if (active) setPeopleLoading(false); });
    }
    return () => { active = false; };
  }, [selectedProject?.id, selectedProject?.is_shared]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    try {
      const payload = createTaskPayload(draft);
      setSaving(true);
      const result = await invoke<{ task: Task; warning: string | null }>("create_task", payload);
      const project = selectedProject?.name || "Inbox";
      onCreated(`Added to ${project}${result.task.due ? "." : ". No due date — find it in Todoist."}`, result.warning);
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const sections = options?.sections.filter(section => section.project_id === draft.project) || [];
  const parents = tasks.filter(task => task.project_id === draft.project && !task.checked && !task.is_completed);
  return <form className="composer" onSubmit={submit} aria-label="Add task">
    <div className="composer-heading"><h2>Add task</h2><button type="button" disabled={saving} onClick={onCancel} aria-label="Close add task">×</button></div>
    <fieldset className="composer-fields" disabled={saving}>
      <label>Task name<input autoFocus required value={draft.content} onChange={e => update("content", e.target.value)} placeholder="What needs to be done?" /></label>
      <label>Description<textarea rows={3} value={draft.description} onChange={e => update("description", e.target.value)} placeholder="Notes, links, and details…" /></label>
      {loading && <p className="muted" role="status">Loading projects and labels…</p>}
      {!loading && !options && <button className="secondary" type="button" onClick={loadOptions}>Retry loading projects</button>}
      <div className="form-row">
        <label>Project<select value={draft.project} disabled={loading || !options} onChange={e => setDraft(old => ({ ...old, project: e.target.value, section: "", parent: "", assignee: "" }))}><option value="">Default Inbox</option>{options?.projects.filter(p => !p.is_archived && !p.is_deleted).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>Section<select value={draft.section} disabled={!sections.length || Boolean(draft.parent)} onChange={e => update("section", e.target.value)}><option value="">No section</option>{sections.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
      </div>
      <div className="form-row">
        <label>Priority<select value={draft.priority} onChange={e => update("priority", e.target.value)}><option value="4">P1 · High</option><option value="3">P2 · Medium</option><option value="2">P3 · Low</option><option value="1">P4 · Normal</option></select></label>
        <label>Schedule<select value={draft.scheduleMode} onChange={e => setDraft(old => ({ ...old, scheduleMode: e.target.value as TaskDraft["scheduleMode"], reminder: "" }))}><option value="date">Date and time</option><option value="natural">Natural language / repeat</option></select></label>
      </div>
      {draft.scheduleMode === "date" ? <div className="form-row"><label>Due date<input type="date" value={draft.date} onChange={e => setDraft(old => ({ ...old, date: e.target.value, reminder: e.target.value ? old.reminder : "" }))} /></label><label>Time · local<input type="time" disabled={!draft.date} value={draft.time} onChange={e => setDraft(old => ({ ...old, time: e.target.value, reminder: e.target.value ? old.reminder : "" }))} /></label></div> : <label>Schedule in English<input value={draft.schedule} onChange={e => update("schedule", e.target.value)} placeholder="Every Monday at 9am" /><small>Todoist interprets this in your account’s time zone.</small></label>}
      <label>Labels{Boolean(options?.labels.length) && <select multiple size={3} value={draft.labels} onChange={e => update("labels", Array.from(e.target.selectedOptions, option => option.value))}>{options?.labels.map(label => <option value={label.name} key={label.id}>{label.name}</option>)}</select>}<input aria-label="Additional labels" value={draft.extraLabels} onChange={e => update("extraLabels", e.target.value)} placeholder="Add label names, separated by commas" /><small>Use Ctrl+click to select multiple existing labels.</small></label>
      <details><summary>More details</summary><div className="advanced-fields">
        <div className="form-row"><label>Deadline<input type="date" value={draft.deadline} onChange={e => update("deadline", e.target.value)} /></label><label>Duration<div className="duration-control"><input aria-label="Duration amount" type="number" min="1" step="1" value={draft.duration} onChange={e => update("duration", e.target.value)} placeholder="30" /><select aria-label="Duration unit" value={draft.durationUnit} onChange={e => update("durationUnit", e.target.value)}><option value="minute">min</option><option value="day">days</option></select></div></label></div>
        <label>Parent task<select value={draft.parent} disabled={!draft.project} onChange={e => { const parent = tasks.find(t => t.id === e.target.value); setDraft(old => ({ ...old, parent: e.target.value, section: parent?.section_id || "" })); }}><option value="">Standalone task</option>{parents.map(t => <option value={t.id} key={t.id}>{t.content}</option>)}</select></label>
        <label>Assign to<select value={draft.assignee} disabled={!selectedProject?.is_shared || peopleLoading} onChange={e => update("assignee", e.target.value)}><option value="">{peopleLoading ? "Loading members…" : "Unassigned"}</option>{collaborators.map(person => <option value={String(person.id)} key={person.id}>{person.name || person.full_name || person.email || String(person.id)}</option>)}</select><small>{selectedProject?.is_shared ? peopleError || "Choose a member of this shared project." : "Available for shared projects."}</small></label>
        <div className="form-row"><label>Reminder<select disabled={draft.scheduleMode !== "date" || !draft.date || !draft.time} value={draft.reminder} onChange={e => update("reminder", e.target.value)}><option value="">Default / no custom reminder</option><option value="0">At due time</option><option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label><label>Send via<select disabled={!draft.reminder} value={draft.reminderService} onChange={e => update("reminderService", e.target.value)}><option value="push">Todoist push</option><option value="email">Email</option></select></label></div>
        <p className="muted">Custom reminders require a date and time. Reminders, duration, and deadlines depend on your Todoist plan. Notifications are delivered by Todoist.</p>
      </div></details>
    </fieldset>
    {error && <div className="composer-error" role="alert">{error}</div>}
    <div className="composer-actions"><button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" disabled={saving || !draft.content.trim()}>{saving ? "Adding…" : "Add task"}</button></div>
  </form>;
}
