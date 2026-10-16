use keyring::Entry;
use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SERVICE: &str = "TodoistDesktopWidget";
const ACCOUNT: &str = "api-token";
const API: &str = "https://api.todoist.com/api/v1";

fn credential() -> Result<Entry, String> { Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string()) }
fn token() -> Result<String, String> { credential()?.get_password().map_err(|_| "No Todoist token has been saved. Open settings and connect Todoist.".to_owned()) }
fn client() -> Client { Client::new() }
async fn request(method: reqwest::Method, endpoint: &str, body: Option<Value>) -> Result<Value, String> {
  let mut req = client().request(method, format!("{API}{endpoint}")).bearer_auth(token()?);
  if let Some(body) = body { req = req.json(&body); }
  let response = req.send().await.map_err(|e| format!("Network error: {e}"))?;
  if response.status().is_success() {
    let bytes = response.bytes().await.map_err(|e| format!("Could not read Todoist response: {e}"))?;
    if bytes.is_empty() { return Ok(Value::Null); }
    serde_json::from_slice(&bytes).map_err(|e| format!("Could not read Todoist response: {e}"))
  }
  else { Err(format!("Todoist returned {}: {}", response.status(), response.text().await.unwrap_or_default())) }
}

#[tauri::command]
fn has_token() -> bool { credential().and_then(|entry| entry.get_password().map_err(|e| e.to_string())).is_ok() }
#[tauri::command]
fn resize_widget(window: WebviewWindow, expanded: bool) -> Result<(), String> {
  let (width, height) = if expanded { (350.0, 520.0) } else { (210.0, 44.0) };
  window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
  if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let area = monitor.work_area();
    let max_x = area.position.x + (area.size.width.saturating_sub(size.width)) as i32;
    let max_y = area.position.y + (area.size.height.saturating_sub(size.height)) as i32;
    window.set_position(PhysicalPosition::new(position.x.clamp(area.position.x, max_x), position.y.clamp(area.position.y, max_y))).map_err(|e| e.to_string())?;
  }
  Ok(())
}
#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
  if token.trim().is_empty() { return Err("The API token cannot be empty.".into()); }
  credential()?.set_password(token.trim()).map_err(|e| format!("Could not save token to Windows Credential Manager: {e}"))
}
#[tauri::command]
async fn get_tasks() -> Result<Vec<Value>, String> {
  get_collection("/tasks").await
}

async fn get_collection(path: &str) -> Result<Vec<Value>, String> {
  let mut tasks = Vec::new();
  let mut endpoint = format!("{API}{path}?limit=200");
  let mut seen = std::collections::HashSet::new();
  loop {
    let relative = endpoint.strip_prefix(API).ok_or("Invalid pagination URL")?;
    let response = request(reqwest::Method::GET, relative, None).await?;
    let (page, cursor) = parse_task_page(response)?;
    tasks.extend(page);
    match cursor {
      None => return Ok(tasks),
      Some(cursor) => {
        if !seen.insert(cursor.clone()) { return Err("Todoist repeated a pagination cursor. Please retry sync.".into()); }
        let mut url = reqwest::Url::parse(&format!("{API}{path}")).map_err(|e| e.to_string())?;
        url.query_pairs_mut().append_pair("limit", "200").append_pair("cursor", &cursor);
        endpoint = url.to_string();
      }
    }
  }
}

#[tauri::command]
async fn get_task_options() -> Result<Value, String> {
  let projects = get_collection("/projects").await?;
  let sections = get_collection("/sections").await?;
  let labels = get_collection("/labels").await?;
  Ok(json!({ "projects": projects, "sections": sections, "labels": labels }))
}

#[tauri::command]
async fn get_collaborators(project_id: String) -> Result<Vec<Value>, String> {
  if !project_id.chars().all(|c| c.is_ascii_alphanumeric()) || project_id.is_empty() {
    return Err("Invalid project ID".into());
  }
  get_collection(&format!("/projects/{project_id}/collaborators")).await
}

fn parse_task_page(response: Value) -> Result<(Vec<Value>, Option<String>), String> {
  let tasks = response.get("results").and_then(Value::as_array)
    .ok_or("Unexpected Todoist task response: missing results array.")?.clone();
  let cursor = match response.get("next_cursor") {
    None | Some(Value::Null) => None,
    Some(Value::String(cursor)) if !cursor.is_empty() => Some(cursor.clone()),
    _ => return Err("Unexpected Todoist pagination cursor.".into()),
  };
  Ok((tasks, cursor))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_tasks_and_next_page_cursor() {
    let (tasks, cursor) = parse_task_page(json!({"results": [{"id": "task-1"}], "next_cursor": "next/page+="})).unwrap();
    assert_eq!(tasks[0]["id"], "task-1");
    assert_eq!(cursor.as_deref(), Some("next/page+="));
  }

  #[test]
  fn accepts_empty_final_page_and_rejects_malformed_response() {
    let (tasks, cursor) = parse_task_page(json!({"results": [], "next_cursor": null})).unwrap();
    assert!(tasks.is_empty());
    assert!(cursor.is_none());
    assert!(parse_task_page(json!({"results": "invalid"})).is_err());
    assert!(parse_task_page(json!({"results": [], "next_cursor": 42})).is_err());
  }

  #[test]
  fn new_task_serialization_preserves_details_and_omits_unused_dates() {
    let task: NewTask = serde_json::from_value(json!({
      "content": "Plan launch", "description": "Release notes", "priority": 4,
      "labels": ["work"], "project_id": "project1", "section_id": "section1",
      "assignee_id": 123, "due_datetime": "2026-10-18T04:00:00Z",
      "duration": 30, "duration_unit": "minute", "deadline_date": "2026-10-20"
    })).unwrap();
    assert!(validate_new_task(&task, Some(&Reminder { minutes: 15, service: "push".into() })).is_ok());
    let payload = serde_json::to_value(task).unwrap();
    assert_eq!(payload["project_id"], "project1");
    assert_eq!(payload["assignee_id"], 123);
    assert_eq!(payload["priority"], 4);
    assert_eq!(payload["description"], "Release notes");
    assert!(payload.get("due_date").is_none());
    assert!(payload.get("due_string").is_none());
  }

  #[test]
  fn rejects_conflicting_schedule_and_reminder_without_time() {
    let mut task: NewTask = serde_json::from_value(json!({
      "content": "Task", "description": "", "priority": 1, "labels": [], "due_date": "2026-10-18"
    })).unwrap();
    assert!(validate_new_task(&task, Some(&Reminder { minutes: 0, service: "push".into() })).is_err());
    task.due_string = Some("tomorrow".into());
    assert!(validate_new_task(&task, None).is_err());
    task.due_string = None;
    task.priority = 5;
    assert!(validate_new_task(&task, None).is_err());
  }
}
#[tauri::command]
async fn create_task(input: NewTask, reminder: Option<Reminder>) -> Result<Value, String> {
  validate_new_task(&input, reminder.as_ref())?;
  let task = request(reqwest::Method::POST, "/tasks", Some(serde_json::to_value(input).map_err(|e| e.to_string())?)).await?;
  let mut warning: Option<String> = None;
  if let Some(reminder) = reminder {
    if let Some(id) = task["id"].as_str() {
      if let Err(error) = request(reqwest::Method::POST, "/reminders", Some(json!({
        "task_id": id, "reminder_type": "relative", "minute_offset": reminder.minutes,
        "service": reminder.service
      }))).await {
        warning = Some(format!("Task was added, but its reminder could not be saved: {error}. Do not add the task again; set its reminder in Todoist."));
      }
    } else { warning = Some("Task was added, but Todoist did not return its ID for the reminder.".into()); }
  }
  Ok(json!({ "task": task, "warning": warning }))
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct NewTask {
  content: String,
  description: String,
  priority: u8,
  labels: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")] project_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] section_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] parent_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] assignee_id: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")] due_date: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] due_datetime: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] due_string: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] due_lang: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] duration: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")] duration_unit: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")] deadline_date: Option<String>,
}

#[derive(serde::Deserialize)]
struct Reminder { minutes: u32, service: String }

fn validate_new_task(task: &NewTask, reminder: Option<&Reminder>) -> Result<(), String> {
  if task.content.trim().is_empty() { return Err("Task title is required.".into()); }
  if !(1..=4).contains(&task.priority) { return Err("Choose a valid priority.".into()); }
  let dates = [task.due_date.is_some(), task.due_datetime.is_some(), task.due_string.is_some()];
  if dates.iter().filter(|v| **v).count() > 1 { return Err("Use either a date/time or a natural-language schedule.".into()); }
  if task.section_id.is_some() && task.project_id.is_none() { return Err("Select a project for this section.".into()); }
  if task.duration.is_some() != task.duration_unit.is_some() || task.duration == Some(0) {
    return Err("Duration needs a positive amount and a unit.".into());
  }
  if let Some(unit) = &task.duration_unit {
    if unit != "minute" && unit != "day" { return Err("Invalid duration unit.".into()); }
  }
  if let Some(reminder) = reminder {
    if task.due_datetime.is_none() { return Err("Set an explicit due date and time before adding a reminder.".into()); }
    if !["push", "email"].contains(&reminder.service.as_str()) { return Err("Invalid reminder service.".into()); }
  }
  Ok(())
}
#[tauri::command]
async fn complete_task(id: String) -> Result<(), String> {
  request(reqwest::Method::POST, &format!("/tasks/{id}/close"), None).await.map(|_| ())
}
#[tauri::command]
fn save_window_position(window: WebviewWindow) -> Result<(), String> {
  let position = window.outer_position().map_err(|e| e.to_string())?;
  let store_path = window.app_handle().path().app_data_dir().map_err(|e| e.to_string())?.join("position.json");
  std::fs::create_dir_all(store_path.parent().unwrap()).map_err(|e| e.to_string())?;
  std::fs::write(store_path, serde_json::to_string(&json!({"x": position.x, "y": position.y})).unwrap()).map_err(|e| e.to_string())
}
fn restore_window_position(app: &AppHandle) {
  let Ok(path) = app.path().app_data_dir().map(|p| p.join("position.json")) else { return; };
  let Ok(raw) = std::fs::read_to_string(path) else { return; };
  let Ok(value) = serde_json::from_str::<Value>(&raw) else { return; };
  let (Some(x), Some(y)) = (value["x"].as_i64(), value["y"].as_i64()) else { return; };
  if let Some(window) = app.get_webview_window("main") { let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32)); }
}
fn toggle(window: &WebviewWindow) { if window.is_visible().unwrap_or(false) { let _ = window.hide(); } else { let _ = window.show(); let _ = window.set_focus(); } }

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(tauri_plugin_window_state::StateFlags::POSITION).build())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .setup(|app| {
      restore_window_position(app.handle());
      let window = app.get_webview_window("main").expect("main window");
      let shortcut: tauri_plugin_global_shortcut::Shortcut = "CommandOrControl+Shift+Space".parse()?;
      app.global_shortcut().on_shortcut(shortcut, move |app, _, event| {
        if event.state() == ShortcutState::Pressed { if let Some(w) = app.get_webview_window("main") { toggle(&w); } }
      })?;
      let tray_window = window.clone();
      let show = MenuItem::with_id(app, "show", "Show widget", true, None::<&str>)?;
      let hide = MenuItem::with_id(app, "hide", "Hide widget", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit Todoist widget", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
      let icon = app.default_window_icon().ok_or("The application icon is missing")?.clone();
      TrayIconBuilder::with_id("widget-tray")
        .icon(icon)
        .tooltip("Todoist Desktop Widget")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
          if event.id.as_ref() == "quit" { app.exit(0); return; }
          if let Some(window) = app.get_webview_window("main") {
            match event.id.as_ref() {
              "show" => { let _ = window.show(); let _ = window.set_focus(); }
              "hide" => { let _ = window.hide(); }
              _ => {}
            }
          }
        })
        .on_tray_icon_event(move |_, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { toggle(&tray_window); }
      }).build(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![has_token, resize_widget, save_token, get_tasks, get_task_options, get_collaborators, create_task, complete_task, save_window_position])
    .run(tauri::generate_context!())
    .expect("error while running Todoist Desktop Widget");
}
