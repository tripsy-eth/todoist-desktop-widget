import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";
import { bucket, dateLabel, type Task, type Section } from "./tasks";
import { TaskComposer, type Options } from "./TaskComposer";

const windowRef = getCurrentWindow();

class RecoveryBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="widget"><section className="empty"><h3>Something interrupted the task view.</h3><p>Your connection is saved. Reload to try again.</p><button onClick={() => location.reload()}>Reload widget</button></section></main> : this.props.children;
  }
}

function App() {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [section, setSection] = useState<Section>("today");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pinned, setPinned] = useState(() => localStorage.getItem("widget-pinned") !== "false");
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    windowRef.setAlwaysOnTop(localStorage.getItem("widget-pinned") !== "false").catch(e => setError(String(e)));
  }, []);

  async function togglePin() {
    if (pinBusy) return;
    setPinBusy(true);
    try {
      await windowRef.setAlwaysOnTop(!pinned);
      localStorage.setItem("widget-pinned", String(!pinned));
      setPinned(!pinned);
    } catch (e) { setError(String(e)); }
    finally { setPinBusy(false); }
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button:not(.drag-handle)")) return;
    event.preventDefault();
    windowRef.startDragging().catch(e => setError(String(e)));
  }

  const pinControl = <button className={`pin-toggle ${pinned ? "pinned" : ""}`} disabled={pinBusy} onClick={togglePin} aria-pressed={pinned} aria-label={pinned ? "Unpin from front" : "Pin to front"} title={pinned ? "Pinned above other windows — click to unpin" : "Click to keep above other windows"}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3h8M9 3v6l-3 4v2h12v-2l-3-4V3M12 15v6"/></svg></button>;

  useEffect(() => {
    invoke("resize_widget", { expanded }).catch(e => setError(String(e)));
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { if (composerOpen) setComposerOpen(false); else { setSettingsOpen(false); setExpanded(false); } } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded, composerOpen]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setTasks(await invoke<Task[]>("get_tasks")); setConnected(true); setLastSync(new Date()); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { invoke<boolean>("has_token").then(has => { setConnected(has); if (has) refresh(); }); }, [refresh]);
  useEffect(() => { const id = window.setInterval(() => { if (connected) refresh(); }, 5 * 60_000); return () => clearInterval(id); }, [connected, refresh]);
  useEffect(() => {
    if (connected) invoke<Options>("get_task_options").then(options => setProjectNames(Object.fromEntries(options.projects.map(project => [project.id, project.name])))).catch(() => {});
  }, [connected, composerOpen]);
  useEffect(() => {
    const unlisten = windowRef.onMoved(() => invoke("save_window_position"));
    return () => { unlisten.then(f => f()); };
  }, []);

  const visible = useMemo(() => bucket(tasks, section), [tasks, section]);
  async function saveToken(event: FormEvent) { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await invoke("save_token", { token }); setToken(""); setConnected(true); setSettingsOpen(false); await refresh(); } catch (e) { setError(String(e)); } finally { setSaving(false); } }
  function addTask(event: FormEvent) { event.preventDefault(); setError(""); setNotice(""); setComposerOpen(true); }
  async function complete(id: string) { if (pending.includes(id)) return; setPending(old => [...old, id]); try { await invoke("complete_task", { id }); await refresh(); } catch (e) { setError(String(e)); } finally { setPending(old => old.filter(value => value !== id)); } }

  if (!expanded) return <main className="pill"><button className="drag-handle" onPointerDown={startDrag} aria-label="Drag widget" title="Drag to move">⠿</button><button className="pill-open" onClick={() => setExpanded(true)} title="Open Todoist widget"><span className="dot"/><strong>{connected ? bucket(tasks, "today").length : "Todoist"}</strong><span className="pill-label">{connected ? "today" : "connect"}</span></button>{pinControl}</main>;
  return <main className="widget">
    <header onPointerDown={startDrag} title="Drag this header to move"><button className="brand" onClick={() => setExpanded(false)} title="Collapse">✓</button><span>Todoist</span><div className="header-actions">{pinControl}<button onClick={refresh} disabled={loading} aria-label="Sync" title="Sync tasks">↻</button><button onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Settings" title="Connection settings">⚙</button><button onClick={() => setExpanded(false)} aria-label="Collapse" title="Collapse (Escape)">−</button></div></header>
    {settingsOpen && <form className="settings" onSubmit={saveToken}><label>Todoist API token<input autoFocus type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={connected ? "Paste a replacement token" : "Paste your API token"} /></label><p>Stored securely in Windows Credential Manager.</p><button disabled={saving || !token.trim()}>{saving ? "Connecting…" : "Save connection"}</button></form>}
    {!connected && !settingsOpen && <section className="empty"><p>Connect Todoist to see your tasks.</p><button onClick={() => setSettingsOpen(true)}>Connect Todoist</button></section>}
    {connected && !settingsOpen && composerOpen && <TaskComposer title={draft} tasks={tasks} onCancel={() => setComposerOpen(false)} onCreated={(message, warning) => { setComposerOpen(false); setDraft(""); refresh().then(() => { setNotice(message); if (warning) setError(warning); }); }} />}
    {connected && !settingsOpen && !composerOpen && <><nav aria-label="Task views">{(["today", "upcoming", "overdue"] as Section[]).map(s => <button aria-pressed={section === s} className={section === s ? "active" : ""} onClick={() => setSection(s)} key={s}>{s}<b>{bucket(tasks, s).length}</b></button>)}</nav><form className="new-task" onSubmit={addTask}><input aria-label="New task" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a task…"/><button aria-label="Open add task details" title="Add task with details">+</button></form><section className="tasks" aria-label={`${section} tasks`}>{!loading && visible.length === 0 && <div className="empty"><h3>{section === "overdue" ? "All caught up" : "A little breathing room"}</h3><p>No {section} tasks.</p></div>}{visible.map(task => <article className="task" key={task.id}><button disabled={pending.includes(task.id)} className={`check priority-${task.priority}`} onClick={() => complete(task.id)} aria-label={`Complete ${task.content}`}/><div><p>{task.content.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")}</p>{task.due && <small className={section === "overdue" ? "overdue" : ""}>{dateLabel(task)}</small>}<div className="task-meta">{projectNames[task.project_id] && <span># {projectNames[task.project_id]}</span>}{task.labels?.map(label => <span key={label}>@{label}</span>)}{task.duration && <span>{task.duration.amount} {task.duration.unit}</span>}{task.deadline && <span>Deadline {task.deadline.date}</span>}</div>{task.description && <details className="task-description"><summary>Description</summary><p>{task.description}</p></details>}</div></article>)}</section></>}
    {notice && !composerOpen && <div className="task-notice" role="status">{notice}</div>}
    <div className="sync-status" role="status">{loading ? "Syncing…" : lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : connected ? "Ready to sync" : "Connect your account to get started"}</div>
    {error && <footer className="error">{error}</footer>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<RecoveryBoundary><App /></RecoveryBoundary>);
