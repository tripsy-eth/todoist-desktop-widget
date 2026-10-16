export type Due = { date: string; string: string; datetime?: string; timezone?: string; is_recurring?: boolean } | null;
export type Task = { id: string; content: string; description: string; is_completed: boolean; checked?: boolean; due: Due; project_id: string; section_id?: string; priority: number; labels?: string[]; duration?: { amount: number; unit: string }; deadline?: { date: string } };
export type Section = "today" | "upcoming" | "overdue";

export function dayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function dueDay(task: Task): string | null {
  const raw = task.due?.datetime || task.due?.date;
  if (!raw || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) return null;
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const instant = new Date(raw);
    return Number.isFinite(instant.getTime()) ? dayKey(instant) : null;
  }
  const day = raw.slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  return Number.isFinite(date.getTime()) && dayKey(date) === day ? day : null;
}

export function dateLabel(task: Task): string {
  const day = dueDay(task);
  if (!day) return task.due?.string || "No date";
  const label = day === dayKey(new Date()) ? "Today" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00`));
  const time = timeLabel(task);
  return `${label}${time ? ` · ${time}` : ""}${task.due?.is_recurring ? " · ↻" : ""}`;
}

export function timeLabel(task: Task): string | null {
  const raw = task.due?.datetime || task.due?.date;
  if (!raw || !/T\d{2}:\d{2}/.test(raw)) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}

export function bucket(tasks: Task[], section: Section, now = new Date()): Task[] {
  const today = dayKey(now);
  return tasks.filter(task => {
    const due = dueDay(task);
    if (!due || task.is_completed || task.checked) return false;
    return section === "today" ? due === today : section === "upcoming" ? due > today : due < today;
  }).sort((a, b) => dueDay(a)!.localeCompare(dueDay(b)!));
}
