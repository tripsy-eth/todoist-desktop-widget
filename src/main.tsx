import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type Due = { date: string; string: string; datetime?: string } | null;
type Task = { id: string; content: string; description: string; is_completed: boolean; due: Due; project_id: string; priority: number };
type Section = "today" | "upcoming" | "overdue";
const windowRef = getCurrentWindow();

function dayKey(value: Date) { return value.toISOString().slice(0, 10); }
function dateLabel(task: Task) {
  if (!task.due) return "No date";
  const date = task.due.date;
  const today = dayKey(new Date());
  if (date === today) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}
function bucket(tasks: Task[], section: Section) {
  const today = dayKey(new Date());
  return tasks.filter(t => {
    const due = t.due?.date;
    return section === "today" ? due === today : section === "upcoming" ? Boolean(due && due > today) : Boolean(due && due < today);
  }).sort((a, b) => (a.due?.date ?? "").localeCompare(b.due?.date ?? ""));
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

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setTasks(await invoke<Task[]>("get_tasks")); setConnected(true); }
    catch (e) { setConnected(false); setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { invoke<boolean>("has_token").then(has => { setConnected(has); if (has) refresh(); }); }, [refresh]);
  useEffect(() => { const id = window.setInterval(() => { if (connected) refresh(); }, 5 * 60_000); return () => clearInterval(id); }, [connected, refresh]);
  useEffect(() => {
    const unlisten = windowRef.onMoved(() => invoke("save_window_position"));
    return () => { unlisten.then(f => f()); };
  }, []);

  const visible = useMemo(() => bucket(tasks, section), [tasks, section]);
  async function saveToken(event: FormEvent) { event.preventDefault(); setError(""); try { await invoke("save_token", { token }); setConnected(true); setSettingsOpen(false); await refresh(); } catch (e) { setError(String(e)); } }
  async function addTask(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; try { await invoke("create_task", { content: draft.trim() }); setDraft(""); refresh(); } catch (e) { setError(String(e)); } }
  async function complete(id: string) { try { await invoke("complete_task", { id }); setTasks(old => old.filter(t => t.id !== id)); } catch (e) { setError(String(e)); } }

  if (!expanded) return <main className="pill" data-tauri-drag-region onClick={() => setExpanded(true)} title="Open Todoist widget"><span className="dot"/><strong>{connected ? bucket(tasks, "today").length : "Todoist"}</strong><span className="pill-label">{connected ? "today" : "connect"}</span></main>;
  return <main className="widget">
    <header data-tauri-drag-region><button className="brand" onClick={() => setExpanded(false)} title="Collapse">✓</button><span data-tauri-drag-region>Todoist</span><div className="header-actions"><button onClick={refresh} aria-label="Sync">↻</button><button onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Settings">⚙</button></div></header>
    {settingsOpen && <form className="settings" onSubmit={saveToken}><label>Todoist API token<input autoFocus type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your API token" /></label><p>Stored in Windows Credential Manager, not in the app files.</p><button>Save connection</button></form>}
    {!connected && !settingsOpen && <section className="empty"><p>Connect Todoist to see your tasks.</p><button onClick={() => setSettingsOpen(true)}>Connect Todoist</button></section>}
    {connected && <><nav>{(["today", "upcoming", "overdue"] as Section[]).map(s => <button className={section === s ? "active" : ""} onClick={() => setSection(s)} key={s}>{s}<b>{bucket(tasks, s).length}</b></button>)}</nav><form className="new-task" onSubmit={addTask}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a task to Inbox…"/><button aria-label="Add task">+</button></form><section className="tasks">{loading && <p className="muted">Syncing…</p>}{!loading && visible.length === 0 && <p className="muted">Nothing here. Nicely done.</p>}{visible.map(task => <article className="task" key={task.id}><button className="check" onClick={() => complete(task.id)} aria-label={`Complete ${task.content}`}/><div><p>{task.content}</p>{task.due && <small className={section === "overdue" ? "overdue" : ""}>{dateLabel(task)}</small>}</div></article>)}</section></>}
    {error && <footer className="error">{error}</footer>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
