export type TaskDraft = {
  content: string; description: string; project: string; section: string; parent: string;
  assignee: string; priority: string; labels: string[]; extraLabels: string;
  scheduleMode: "date" | "natural"; date: string; time: string; schedule: string;
  deadline: string; duration: string; durationUnit: string; reminder: string; reminderService: string;
};
export const emptyDraft: TaskDraft = {
  content: "", description: "", project: "", section: "", parent: "", assignee: "", priority: "1",
  labels: [], extraLabels: "", scheduleMode: "date", date: "", time: "", schedule: "",
  deadline: "", duration: "", durationUnit: "minute", reminder: "", reminderService: "push",
};

export function createTaskPayload(draft: TaskDraft) {
  if (!draft.content.trim()) throw new Error("Give the task a title.");
  if (draft.scheduleMode === "date" && draft.time && !draft.date) throw new Error("Choose a date for the due time.");
  const dueDatetime = draft.scheduleMode === "date" && draft.date && draft.time
    ? new Date(`${draft.date}T${draft.time}`).toISOString() : undefined;
  if (draft.reminder && !dueDatetime) throw new Error("Set a due date and time to use a reminder.");
  const duration = draft.duration ? Number(draft.duration) : undefined;
  if (duration !== undefined && (!Number.isInteger(duration) || duration <= 0)) throw new Error("Duration must be a positive whole number.");
  const assignee = draft.assignee ? Number(draft.assignee) : undefined;
  if (assignee !== undefined && !Number.isSafeInteger(assignee)) throw new Error("This assignee ID cannot be represented safely.");
  return {
    input: {
      content: draft.content.trim(), description: draft.description.trim(), priority: Number(draft.priority),
      labels: [...new Set([...draft.labels, ...draft.extraLabels.split(",").map(s => s.trim()).filter(Boolean)])],
      project_id: draft.project || undefined, section_id: draft.section || undefined,
      parent_id: draft.parent || undefined, assignee_id: assignee,
      due_date: draft.scheduleMode === "date" && draft.date && !draft.time ? draft.date : undefined,
      due_datetime: dueDatetime,
      due_string: draft.scheduleMode === "natural" && draft.schedule.trim() ? draft.schedule.trim() : undefined,
      due_lang: draft.scheduleMode === "natural" && draft.schedule.trim() ? "en" : undefined,
      deadline_date: draft.deadline || undefined, duration, duration_unit: duration ? draft.durationUnit : undefined,
    },
    reminder: draft.reminder ? { minutes: Number(draft.reminder), service: draft.reminderService } : null,
  };
}
