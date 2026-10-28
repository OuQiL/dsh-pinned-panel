# Changelog

All notable changes to this plugin. Versions follow [SemVer](https://semver.org/).

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
