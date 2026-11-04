# Changelog

All notable changes to this plugin. Versions follow [SemVer](https://semver.org/).

## 0.7.0 — activity dot

- **New:** each pinned row shows the conversation's activity in its leading slot, replacing the pin
  glyph while something is happening: a **pulsing dot while running** (business color), a **warning
  dot while waiting for approval / plan review / an answer**, and a **success dot for an unread
  completion**.
- The state comes from the shipped Session-status snapshot (`useSessionStatus`, i.e.
  `Map<SessionId, { running, pendingInteraction, completionUnread }>`), so it matches the dots the
  shipped rows draw and updates live. A pending interaction outranks running, which outranks an
  unread completion.
- The dot carries a localized tooltip/`aria-label` ("运行中", "等待审批", "等待回答", …); archived
  rows keep the archive glyph and show no activity.

## 0.6.0 — archived section

- **New:** an **Archived** section under the pinned rows (collapsed by default, choice remembered):
  *Archived N* expands into the archived conversations, newest first, each with a restore button that
  calls the official `uiWorkspace.unarchiveSession()`.
- Archived rows are display-only: they do not open (an archived Session is not openable) and they are
  dimmed so they read as secondary.
- The group now also renders when there are no pinned rows but archived ones exist, so archiving the
  last pinned conversation does not hide the only way back.
- New storage key: `dsh-pinned-panel.sidebar.archived-open`.

## 0.5.0 — rename in place

- **New:** rename a pinned conversation without leaving the group: **double-click its title**
  (or pick *Rename* in the ⋮ menu) to turn the title into an input, then Enter to save,
  Escape to cancel, blur to save when changed.
- The call is the same one the shipped browser makes:
  `sessions.using(sessionId, { source: 'workspaceOperation' }, (ref) => ref.binding.session.rename(title))`,
  so the Host validates the title, publishes the new one and raises its own errors. A rejected
  `RemoteResult` is logged and the row keeps showing the old title.
- Renaming suppresses the row's open/navigation click while the input is focused.

## 0.4.0 — per-row actions

- **New:** each pinned row has a ⋮ menu with the shipped per-session actions: **fork**
  (`uiWorkspace.forkSession`, then the fork opens), **copy session ID**, **unpin**
  (`uiWorkspace.unpinSession`) and **archive** (`uiWorkspace.archiveSession`).
- Archiving a conversation that is still running asks first: the menu switches to
  *stop and archive* / *cancel*, matching the shipped row's confirmation instead of
  silently stopping work.
- The quick ✕ unpin on hover stays; the menu is the discoverable path for the rest.
- Rename is intentionally not in the menu: it belongs to the shipped row's double-click
  flow over the browser's own overlay state, which a client half cannot open.

## 0.3.0 — single-surface release

- **Removed** the sidebar rail entry (the 📌 panel icon), the full Pinned page, and the
  redirect panel behind that icon. The plugin now adds exactly one thing: the Pinned group
  at the top of the session list.
- The always-on seat that owns the list injection moved into the sidebar shell
  (`sidebar.footer.action`) and renders nothing, so no extra chrome is added.
- The group's count is a plain label again (it used to open the removed page).
- The seam caches the located list area, so unrelated mutations no longer rescan the document.
- The group adopts the shipped `groupSection` wrapper class for native spacing.

## 0.2.1 — package manifest fix

- **Fixed** a UTF-8 BOM that a tooling edit left on `package.json`. `JSON.parse` (and therefore
  a GitHub/pnpm install of the bundle) rejected it with `Unexpected token '﻿'`.
- Added a verification script and a CI workflow that check encoding, JSON, the manifest, and the
  client module on every push.

## 0.2.0 — clean-up after the navigation fixes

- Removed the diagnostic row id suffixes and the header version badge; the console keeps a single
  activation line (`[dsh-pinned-panel] active vX.Y.Z`).
- Documented the React portal event-bubbling constraint that caused rows to "flash and then jump
  back to the first pinned conversation".

## 0.1.6 — navigation actually lands

- **Fixed**: portaled children bubble through the **React** tree, so clicking an injected row also
  ran the sidebar panel button's `onClick`, selected the Pinned panel, and let its redirect pull the
  main column back to the newest pinned conversation. The group now stops propagation for its own
  interactions.

## 0.1.5 — diagnostics

- Added a per-row session-id suffix and a header version badge to distinguish "wrong id" from
  "navigation ignored" while diagnosing the jump.

## 0.1.4 — navigation verification

- After `uiWorkspace.openSession(id)`, verify that the main view actually retained that Session;
  otherwise dispatch a click on the app's own row (`[data-row-key="session:<id>"]`).

## 0.1.3 — legacy module id

- Encountered: a profile that still had the pre-rename package installed asked the client loader
  for `@local/dsh-pinned-panel`; the bundle registered only the renamed id and failed with
  `loaded without registering …`.
- The factory is registered under both ids; the legacy registration is inert once the old package
  is uninstalled.

## 0.1.0 — first working version

- A Pinned group first in the sidebar session list (expanded by default, collapsible, remembered),
  opened through the official `uiWorkspace.openSession()` so a conversation keeps its workspace.
- Per-row unpin through `uiWorkspace.unpinSession()`; origin workspace shown per row.
- Rows read the Host pin set directly — no private pin storage.
- Shipped as a profile bundle with a no-op Host half, installed with
  `dsh plugin add github:OuQiL/dsh-pinned-panel`.
