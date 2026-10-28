# dsh-pinned-panel

[![version](https://img.shields.io/github/v/tag/OuQiL/dsh-pinned-panel?label=version&sort=semver)](https://github.com/OuQiL/dsh-pinned-panel/tags)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![platform](https://img.shields.io/badge/platform-DSH%20Web%20GUI-lightgrey.svg)](#requirements)

> **A Pinned group at the top of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) sidebar.**
> Pinned conversations stop being pinned *inside* one workspace: they are collected into a **Pinned group first in the session list**, expanded by default — and opening one still drops you back into **its original workspace**.

English | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="assets/sidebar-pinned-zh.png" alt="The Pinned group at the top of the sidebar, above the workspace groups, listing two pinned conversations with their origin workspace and time" width="340">
</p>

<p align="center"><em>Pinned group first in the session list — two pinned conversations from one workspace, each still opening in its own workspace. (Chinese UI shown; titles and labels follow the active locale.)</em></p>

## Contents

- [What you get](#what-you-get)
- [Install](#install)
- [Requirements](#requirements)
- [How it works](#how-it-works)
- [Compared with dsh-pin](#compared-with-dsh-pin)
- [FAQ and troubleshooting](#faq-and-troubleshooting)
- [Security and privacy](#security-and-privacy)
- [Known limitations](#known-limitations)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## What you get

```
Sidebar
├─ 📌 Pinned                     3      ← first in the list, expanded by default
│   ├─ 🔧 Fix expired login      14:32
│   ├─ 📊 API diff report        Yesterday
│   └─ 📝 Weekly draft           10-21
├─ 📁 default-workspace                 ← your workspaces, untouched
│   ├─ Conversation A
│   └─ Conversation B
└─ 📁 another-workspace
```

- **Pinned group first in the sidebar session list.** Same row metrics as the shipped session rows (32px rows, 34px group header, `--dsw-radius-md`, hover/focus rings), light and dark themes included.
- **Expanded by default**, collapsible from its header (the choice is remembered in `localStorage`).
- **Click a row → the conversation opens in its original workspace.** It uses the official `uiWorkspace.openSession()` call, exactly like clicking that row in the sidebar: same working directory, same context, same history.
- **Rows are not duplicated into a private store.** The group reads the Host's own `pinnedSessionIds` and workspace membership; pinning/unpinning stays the shipped 📌 action (plus a ✕ on hover).
- **Origin is visible.** Each row shows the workspace it belongs to; hover it for the full title.
- **Per-row actions without leaving the group.** Hover a row for its ⋯ menu: **fork**, **copy session ID**, **unpin**, or **archive** — all through the same official calls the shipped rows use (`forkSession`, `unpinSession`, `archiveSession`). Archiving a conversation that is still running asks *stop and archive* first instead of silently ending its work.
- **Original rows stay.** A pinned conversation is still listed under its own workspace — the Pinned group is an extra entry point, not a move.
- **No extra panel, no extra page.** The plugin adds the group and nothing else; there is no pinned page and no rail icon to configure.

## Install

### In the app (easiest)

1. Open **Settings → Plugins**.
2. **Add plugin**.
3. Paste the Git address of this repository:

   ```
   github:OuQiL/dsh-pinned-panel
   ```

   (the dialog also accepts the full `https://github.com/OuQiL/dsh-pinned-panel` URL, a tarball, or an absolute local path)

4. Reload the page. The **Pinned** group appears at the top of the conversation list.

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

| | |
|---|---|
| Surface | DeepSeek Harness **Web GUI** (the Desktop app renders the same Web surface) |
| Tested with | `0.2.1-rc.2` on Windows |
| Host half | none — it is a no-op; everything runs in the browser |
| Credentials / network | none |
| Sidebar | required; TUI/headless profiles have nothing to attach to |

Because it attaches to the sidebar list, a DSH release that restructures that list may require a small adaptation (see [How it works](#how-it-works)); the plugin degrades to "no group" rather than breaking the app.

## How it works

```
pinned state (Host)                   uiWorkspace service (shipped)
  pinnedSessionIds  ────┐                openSession(id)  ──► selects the Session
  items[].sessionIds ───┴──► Pinned group ──► unpinSession(id) ──► writes the pin set
                              (sidebar list)      (both official calls)
```

The shipped Workspace browser owns the **single** `sidebar.workspaces` slot, so there is no slot to add a group inside its list. Replacing the whole browser would mean reimplementing the app's session list and would break on upgrades. The smallest intervention is a sibling group at the top:

1. The plugin mounts one **invisible seat** in the sidebar shell (`sidebar.footer.action`, an empty action beside Settings; the seat renders nothing).
2. From that seat's own DOM node it walks up to the browser's list area, then finds the scroll container.
3. It inserts one host element as the list's **first child** and portals the group into it, adopting the shipped group wrapper class so native spacing applies.
4. A `MutationObserver` (plus a slow fallback tick) re-attaches the host after React rebuilds the list.

It only **inserts**, never hides or reorders anything the app renders.

### The seam is defensive

- Anchored from the plugin's own node, never from a global selector.
- Matches build-hashed class **suffixes** (`*_listArea`, `*_list`, `*_groupSection`), so it survives class-hash changes.
- Skips the flat "In one list" view and the search view (no workspace groups to sit above).
- If the expected structure is missing, it does nothing and logs one line:
  `[dsh-pinned-panel] sidebar list seam not found; the Pinned group cannot be placed.`

One React detail matters here: portal events bubble through the **React** tree, not the DOM tree, so the portaled group stops propagation for its own interactions. That keeps clicks inside the group from reaching whichever seat the portal is mounted under.

## Compared with dsh-pin

[dsh-pin](https://github.com/Yu-tao-Li/dsh-pin) is the closest existing plugin; both are pure client-side, both attach to the sidebar list, and both use the shipped session-order/open APIs. The difference is the shape:

| | dsh-pinned-panel (this) | dsh-pin |
|---|---|---|
| Where pins show up | one **Pinned group** first in the session list | a **global tray** above all workspace groups, plus in-group pinning |
| Original rows | always kept | optionally hidden for globally pinned rows |
| Pin levels | one — it reuses the app's own pin state | two — workspace pin and global pin, with its own records |
| Extra chrome | none (no page, no rail icon) | tray chrome and per-row pin buttons |
| State it owns | only your collapse preference | its own `localStorage` records per pinned session |
| Undo / restore | the app's own unpin | precise restore of the pre-pin position |

If you want a floating tray and hidden original rows, use dsh-pin. If you want one extra group in the list and nothing else, use this.

## FAQ and troubleshooting

**The group does not appear.**
Open the browser console. If it shows
`[dsh-pinned-panel] sidebar list seam not found; the Pinned group cannot be placed.`,
your DSH build moved the sidebar list and the seam needs adapting — please open an issue with that line and your DSH version.

**The group appears twice, or loading fails with `loaded without registering …`.**
An older copy under the pre-rename package id (`@local/dsh-pinned-panel`) is still installed. Uninstall it (Settings → Plugins) or restart the app; the bundle registers both ids so a leftover copy does not error out.

**Clicking a row keeps ending on the same conversation.**
Fixed in `0.1.6`; make sure you are on `0.3.0`+ (console prints `[dsh-pinned-panel] active vX.Y.Z`).

**How do I verify which version is loaded?**
The console line on page load, or the Plugins page entry.

**Do I need to configure anything?**
No settings. The only stored value is your collapse choice, under the `dsh-pinned-panel.sidebar.collapsed` key.

**Does it work across browsers?**
Pin state comes from the Host, so yes. The collapse preference is per browser.

**Where do I unpin?**
The app's own 📌 action (as before), or the ✕ that appears on a row in the group.

## Security and privacy

- **No network requests, no telemetry, no credentials.** The Host half is an empty `apply()`.
- **Reads** the Host workspace and session snapshots the sidebar already displays (titles, ids, timestamps, workspace membership).
- **Writes** exactly one browser key: `localStorage['dsh-pinned-panel.sidebar.collapsed']`. Pin changes are the app's own actions through `uiWorkspace`.
- **DOM**: inserts one host element as the first child of the sidebar list and renders into it with a React portal. Nothing else in the app is modified, hidden, or reordered.
- **Styles**: an inline `<style>` element registered with the plugin's lifetime and using only DSH theme tokens.

## Known limitations

- The group is a **display-layer insert**. It does not change session order or write extra state; the app's own "pinned first inside the group" ordering is untouched.
- Pinned conversations that belong to **no** workspace are shown inline without an origin label.
- Rows are ordered by last update (newest first).
- This plugin follows the app's pin semantics. It does not add its own pin storage, so everything stays consistent across reloads and browsers.
- A future DSH release that restructures the sidebar browser may require adapting the seam (the suffixes above are the contract).

## Development

```
package.json          bundle manifest: Host patch + browser half
cordis.patch.yml      inserts one Host plugin row (no-op Host half)
index.js              Host half: empty apply()
lib/client.js         browser bundle: sidebar seat, list seam, Pinned group
locale/{zh,en}.json   Plugin Manager title/description
icon.svg              original artwork
scripts/verify.mjs    local self-check (encoding, JSON, manifest, client module)
scripts/ci-workflow-template.yml  drop-in GitHub Actions workflow for that check
assets/               README screenshot of the sidebar group
```

```bash
node scripts/verify.mjs     # encoding + JSON + manifest + client module
node --check lib/client.js  # syntax only
```

There is no build step: `lib/client.js` is the shipped browser module
(`window.__ModuleLoader__.load({ id, factory })`), read directly by the client at page load.
It registers the factory under both the current package id and the pre-rename
`@local/dsh-pinned-panel` id, so a profile that still has the old package installed keeps
loading instead of failing with `loaded without registering …`. The legacy id is inert once
that package is uninstalled.

See [CHANGELOG.md](CHANGELOG.md) for the release history, including the two bugs that shaped the
current implementation (portaled event bubbling, and a UTF-8 BOM that broke GitHub installs).

## Contributing

Issues and pull requests are welcome.

- For a bug report, include your DSH version and every console line starting with `[dsh-pinned-panel]`.
- Before opening a pull request, run `node scripts/verify.mjs`.
- `scripts/ci-workflow-template.yml` is a ready-to-use Actions workflow for that check; copy it to
  `.github/workflows/verify.yml` from an account/token allowed to edit workflows.
- Anything that changes visual behaviour should say which DSH build it was verified on.

## License

[MIT](LICENSE) © 2026 OuQiL

Not affiliated with DeepSeek. "DeepSeek Harness" is the host application this plugin extends.
