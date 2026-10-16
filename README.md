# Todoist Desktop Widget

A compact, always-on-top Windows 11 widget built with Tauri 2, React, and TypeScript. Click the pill to expand it. Drag its header to reposition it.

## Prerequisites

- Node.js 20+
- Rust stable (install from https://rustup.rs)
- Microsoft C++ Build Tools with the Desktop development with C++ workload (required by Tauri on Windows)

## Run it

1. Install dependencies: `npm install`
2. Start the desktop app: `npm run tauri dev`
3. In the widget settings, paste a Todoist API token created at https://app.todoist.com/app/settings/integrations/developer.

## Controls

- Click the compact pill to expand; click the red check icon in the header to collapse.
- Drag the widget header to move it. Its position is restored when the app reopens.
- `Ctrl+Shift+Space` hides/shows the widget.
- Click the tray icon to hide/show the widget.

## Security and limitations

The API token is stored using the Windows Credential Manager via the native `keyring` crate; it is not kept in localStorage or the app configuration. Tasks are synced when the app opens, manually using the sync button, and every five minutes while connected.

This MVP uses Todoist's REST API v1 and supports viewing due Today, Upcoming, and Overdue tasks, adding inbox tasks, and marking tasks complete. It does not yet support OAuth login, project selection, recurring-task UI, offline queueing, or conflict resolution.
