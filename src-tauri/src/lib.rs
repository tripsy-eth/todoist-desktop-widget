use keyring::Entry;
use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
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
  if response.status().is_success() { response.json().await.map_err(|e| format!("Could not read Todoist response: {e}")) }
  else { Err(format!("Todoist returned {}: {}", response.status(), response.text().await.unwrap_or_default())) }
}

#[tauri::command]
fn has_token() -> bool { credential().and_then(|entry| entry.get_password().map_err(|e| e.to_string())).is_ok() }
#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
  if token.trim().is_empty() { return Err("The API token cannot be empty.".into()); }
  credential()?.set_password(token.trim()).map_err(|e| format!("Could not save token to Windows Credential Manager: {e}"))
}
#[tauri::command]
async fn get_tasks() -> Result<Vec<Value>, String> {
  let response = request(reqwest::Method::GET, "/tasks", None).await?;
  response.as_array().cloned().ok_or_else(|| "Unexpected Todoist task response.".into())
}
#[tauri::command]
async fn create_task(content: String) -> Result<Value, String> {
  if content.trim().is_empty() { return Err("Task content cannot be empty.".into()); }
  request(reqwest::Method::POST, "/tasks", Some(json!({"content": content.trim()}))).await
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
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .setup(|app| {
      restore_window_position(app.handle());
      let window = app.get_webview_window("main").expect("main window");
      let shortcut = "CommandOrControl+Shift+Space".parse().unwrap();
      app.global_shortcut().on_shortcut(shortcut, move |app, _, event| {
        if event.state() == ShortcutState::Pressed { if let Some(w) = app.get_webview_window("main") { toggle(&w); } }
      })?;
      let tray_window = window.clone();
      TrayIconBuilder::with_id("widget-tray").tooltip("Todoist Desktop Widget").on_tray_icon_event(move |tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { toggle(&tray_window); }
        let _ = tray.app_handle();
      }).build(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![has_token, save_token, get_tasks, create_task, complete_task, save_window_position])
    .run(tauri::generate_context!())
    .expect("error while running Todoist Desktop Widget");
}
