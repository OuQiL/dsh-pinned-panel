# dsh-pinned-panel

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![platform](https://img.shields.io/badge/platform-DSH%20Web%20GUI-lightgrey.svg)](#requirements)
[![dsh](https://img.shields.io/badge/dsh-0.2.x-4B6BFB.svg)](#requirements)

> **A dedicated Pinned area for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**
> Pinned conversations stop being pinned *inside* one workspace: they are collected into a **Pinned group at the top of the sidebar**, expanded by default — and opening one still drops you back into **its original workspace**.

English | [简体中文](README.zh-CN.md)

---

## What you get

```
Sidebar
├─ 📌 Pinned                     3      ← new group, first in the list, expanded by default
│   ├─ 🔧 Fix expired login      14:32
│   ├─ 📊 API diff report        Yesterday
│   └─ 📝 Weekly draft           10-21
├─ 📁 default-workspace                 ← your workspaces, untouched
│   ├─ Conversation A
│   └─ Conversation B
└─ 📁 another-workspace
```

- **Pinned group at the top of the sidebar list.** Same row metrics as the shipped session rows (32px rows, 34px group header, `--dsw-radius-md`, hover/focus rings), light and dark themes included.
- **Expanded by default**, collapsible from its header (the choice is remembered in `localStorage`).
- **Click a row → the conversation opens in its original workspace.** It uses the official `uiWorkspace.openSession()` call, exactly like clicking that row in the sidebar: same working directory, same context, same history.
- **Rows are not duplicated into a private store.** The group reads the Host's own `pinnedSessionIds` and workspace membership; pinning/unpinning stays the shipped 📌 action (plus a ✕ on hover).
- **Origin is visible.** Each row shows the workspace it belongs to; hover it for the full title.
- **Original rows stay.** A pinned conversation is still listed under its own workspace — the Pinned group is an extra entry point, not a move.
- **One click from the rail, straight into the conversation.** The 📌 icon in the sidebar rail jumps to the **most recently updated pinned conversation** — no intermediate page. With nothing pinned it opens the Pinned page, whose empty state explains how to pin.
- **A full Pinned page where it belongs.** The count next to the “Pinned” group header (or the empty state) opens a *Pinned* page that groups every pinned conversation by workspace. If a future DSH release rearranges the sidebar list, this page is the part that keeps working.

## Install

### In the app (easiest)

1. Open **Settings → Plugins**.
2. **Add plugin**.
3. Paste the Git address of this repository:

   ```
   github:OuQiL/dsh-pinned-panel
   ```

   (the dialog also accepts the full `https://github.com/OuQiL/dsh-pinned-panel` URL, a tarball, or an absolute local path)

4. Reload the page. A 📌 appears in the sidebar rail and the **Pinned** group appears at the top of the conversation list.

### With the CLI

```bash
dsh plugin add github:OuQiL/dsh-pinned-panel
# or pin a profile explicitly
dsh plugin --profile desktop add github:OuQiL/dsh-pinned-panel
```

### From a local checkout

```bash
git clone https://github.com/OuQiL/dsh-pinned-panel.git
dsh plugin add /absolute/path/to/dsh-pinned-panel
```

After changing `lib/client.js` in a linked checkout, reload the page (`Ctrl+R`) to load the fresh bundle; no reinstall is needed.

### Uninstall

Settings → Plugins → *dsh-pinned-panel* → disable/uninstall, or `dsh plugin remove dsh-pinned-panel`.

## Requirements

- DeepSeek Harness **Web GUI** (the Desktop app renders the same Web surface), tested on `0.2.1-rc.2` on Windows.
- No Host capability, no credentials, no network endpoints: the Host half is a no-op, everything is client-side.
- Only the Web GUI has a sidebar; TUI/headless profiles have nothing to attach to.

## How it works

```
pinned state (Host)            uiWorkspace service (shipped)
  pinnedSessionIds  ─────┐        openSession(id) ──► selects the Session
  items[].sessionIds ────┴──► Pinned group ──► unpinSession(id) ──► pin set
                               (sidebar list + page)   (both official calls)
```

Two rendering surfaces, one data source:

| Surface | How it is mounted |
|---|---|
| **Pinned page** | First-class slots: an icon in `sidebar.panellist` and a page under the same id in the `main` keyed slot (`ctx.layout.selectPanel('pinned')` switches to it). |
| **Pinned group in the list** | The shipped Workspace browser owns the **single** `sidebar.workspaces` slot, so there is no slot to add a group inside its list. The plugin mounts one always-present seat in `sidebar.panellist`, walks up from *its own* DOM node to the browser's scroll container, inserts one host element as the list's first child, and portals the group into it. A `MutationObserver` (plus a slow fallback tick) re-attaches after React rebuilds the list. |

Why the DOM seam at all: replacing the whole Workspace browser would mean reimplementing the app's session list and would break on upgrades. Adding a sibling group at the top is the smallest possible intervention — it only **inserts**, never hides or reorders anything the app renders.

The rail icon is the shell's own panel button, and its click selects the `main` entry registered under that id — the plugin cannot intercept that click reliably. So that entry is a **redirect**: the moment it mounts it opens the newest pinned conversation from a layout effect (before paint), and the panel is replaced by the conversation. With nothing pinned it renders the grouped page instead, empty state and all. The grouped page has its own second key, which the count in the sidebar group opens directly — no redirect.

### The seam is defensive

- Anchored from the plugin's own node (`closest`-style walk), never from a global selector.
- Matches build-hashed class **suffixes** (`*_listArea`, `*_list`, `*_groupSection`), so it survives class-hash changes.
- Skips the flat "In one list" view and the search view (no workspace groups to sit above).
- If the expected structure is missing, it does nothing and logs one line:
  `[dsh-pinned-panel] sidebar list seam not found; the Pinned page in the sidebar rail still works.`
- The page surface never depends on the seam.

## Known limitations

- The sidebar group is a **display-layer insert**. It does not change session order or write extra state; the app's own "pinned first inside the group" ordering is untouched.
- Pinned conversations that belong to **no** workspace are grouped as *Ungrouped* on the page and shown inline (no origin label) in the sidebar group.
- The page groups by workspace; within a group rows are ordered by last update.
- This plugin follows the app's pin semantics. It does not add its own pin storage, so everything stays consistent across reloads and browsers.
- A future DSH release that restructures the sidebar browser may require adapting the seam (the suffixes above are the contract). The page is unaffected.

## Development

```
package.json          bundle manifest: Host patch + browser half
cordis.patch.yml      inserts one Host plugin row (no-op Host half)
index.js              Host half: empty apply()
lib/client.js         browser bundle: sidebar group seam, rail icon, Pinned page
locale/{zh,en}.json   Plugin Manager title/description
icon.svg              original artwork
```

```bash
node --check lib/client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
```

There is no build step: `lib/client.js` is the shipped browser module
(`window.__ModuleLoader__.load({ id, factory })`), read directly by the client at page load.

## License

[MIT](LICENSE) © 2026 OuQiL

Not affiliated with DeepSeek. "DeepSeek Harness" is the host application this plugin extends.
