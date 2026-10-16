// Prevents a second console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() { todoist_desktop_widget_lib::run(); }
