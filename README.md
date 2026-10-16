# Todoist Desktop Widget

A Windows 11 desktop widget built with Tauri 2, React, and TypeScript. A compact pill expands into Today, Upcoming, and Overdue task lists. Pin it above other windows or let it behave like a normal window.

## Features

- Draggable compact and expanded views, with restored window position and a saved pin preference.
- Due dates and times, recurring schedule indicators, project names, labels, duration, deadlines, and expandable descriptions.
- Detailed task creation, task completion, manual sync, and automatic sync every five minutes.
- Windows system tray icon with Show, Hide, and Quit actions, plus a global keyboard shortcut.
- API token stored in Windows Credential Manager; no token is saved in project files.

## Prerequisites

- Node.js 24 LTS (also runs the TypeScript regression tests)
- Rust stable (install from https://rustup.rs)
- Microsoft C++ Build Tools with the Desktop development with C++ workload (required by Tauri on Windows)
- Microsoft Edge WebView2 Runtime (normally already available on Windows 11)

## Run it

1. Open PowerShell in this repository and install dependencies: `npm ci`
2. Start the desktop app: `npm run tauri dev`
3. In the widget settings, paste a Todoist API token created at https://app.todoist.com/app/settings/integrations/developer.

Keep the terminal open during development. After installing Node or Rust, open a fresh terminal so it picks up their PATH entries.

## Build a Windows executable and installer

From the repository folder, run:

```powershell
npm ci
npm run tauri build
```

The production build creates:

- Application: `src-tauri/target/release/todoist-desktop-widget.exe`
- NSIS installer: an `.exe` in `src-tauri/target/release/bundle/nsis/`

Run the installer, then launch Todoist Desktop Widget from the Start menu. The installed application does not need Node, Rust, a terminal, or a development server; it uses WebView2. The installer handles WebView2 installation if needed. This repository does not currently configure code signing, so Windows may show an unknown-publisher warning.

The executable and installer are generated outputs and are not committed to Git. To distribute a build, attach the installer to a GitHub release separately. Building does not publish a release automatically.

## Controls

- Click the compact pill to expand; click the red check icon in the header to collapse.
- Escape or the minus button also collapses the widget. The native window resizes to match the pill or expanded list, and expanding keeps it within the current monitor's work area.
- Drag the expanded widget's header (outside its buttons), or the dotted grip on the compact pill, to move it. Its position is restored when the app reopens.
- The pin button is available in both views. Highlighted means the widget stays above other windows; unpinning lets other applications cover it. This preference is saved.
- `Ctrl+Shift+Space` hides/shows the widget.
- Click the tray icon to hide/show the widget.
- Right-click the red checkmark tray icon for Show, Hide, and Quit. Windows may initially place it in the tray overflow menu.

## Security and limitations

The API token is stored using the Windows Credential Manager via the native `keyring` crate; it is not kept in localStorage or the app configuration. Tasks are synced when the app opens, manually using the sync button, and every five minutes while connected.

This widget uses Todoist's API v1 and supports Today, Upcoming, and Overdue views, creating detailed tasks, and completing tasks. It does not yet support OAuth login, offline queueing, or conflict resolution.

## Adding tasks and showing times

Click the + button (or enter a title and press Enter) to open Add Task. You can set the title, description, project, section, priority, due date and local time, labels, or an English natural-language schedule such as "every Monday at 9am". More details includes deadline, duration, parent task, shared-project assignee, and a custom relative reminder via Todoist push or email. Projects, sections, labels, and collaborators load from your account.

An explicit date/time is converted from your PC's local time to an ISO timestamp. Natural-language schedules use your Todoist account's time zone. Task cards display due times in your PC's local time, plus recurrence, project, labels, duration, deadline, and an expandable description. Tasks without a due date are created normally but do not appear in these three date-based views; the success message points you to Todoist.

Reminders, duration, and deadlines may require an eligible Todoist plan. Custom reminders currently require an explicit date and time. Todoist delivers notifications; this widget does not schedule Windows notifications. If a task is created successfully but the reminder fails, the app reports partial success and does not ask you to resubmit the task. Native Todoist features such as file attachments, location reminders, and comments are not included in this form.

## Verification

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

These checks cover date/time display, local-date filtering, full task payloads, schedule validation, paginated responses, and native task validation. Tests use fixtures and do not create tasks in your account. A successful frontend build alone does not verify Windows interactions or live Todoist behavior.

Upcoming supports both date-only and datetime values returned by Todoist. Today uses your local calendar date. Malformed dates cannot crash the date formatter. The expanded window has an opaque background and a scrolling task list; unexpected rendering errors show a reload action.

## Troubleshooting

- If the tray icon is missing, check Windows' hidden-icons overflow menu. Restart the desktop app after changing native code or permissions.
- Drag the dotted grip in the pill or a blank part of the expanded header, rather than buttons or task rows.
- If the development server reports a locked Rust build file, ensure Vite's watcher ignores `src-tauri/target` as configured in this repository.
- If `node` or `cargo` is unavailable, verify its installation and restart the terminal. A folder containing npm without `node.exe` indicates an incomplete Node installation.
- If saving credentials fails, restart Windows and retry. Do not paste your API token into an issue, terminal log, or commit.

## Project layout

- `src/`: React interface, task form, date helpers, and frontend tests.
- `src-tauri/src/`: native window/tray integration, secure credentials, API requests, and Rust tests.
- `src-tauri/capabilities/`: permissions for window dragging and pinning.
- `src-tauri/icons/icon.ico`: Windows application and tray icon.
- `scripts/create-icon.cjs`: regenerate the checked-in icon with `node scripts/create-icon.cjs`.

This is an independent personal widget, not an official Todoist application.
