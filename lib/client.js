/**
 * dsh-pinned-panel — a dedicated Pinned area for the DSH Web client.
 *
 * Two surfaces, one source of truth:
 *
 * 1. Sidebar group (primary): the shipped Workspace browser occupies the single
 *    `sidebar.workspaces` slot, so a plugin has no slot to add a group inside its
 *    list. This plugin therefore mounts one always-present React seat in the
 *    `sidebar.panellist` list and portals a "Pinned" group into the browser's own
 *    scroll container (`*_list`) as its first child. The group is expanded by
 *    default, uses the shipped row metrics (32px rows, 34px header, the app's
 *    radius/hover tokens), and opens rows through the official
 *    `uiWorkspace.openSession()`, so a conversation keeps running in its original
 *    workspace. Rows are never duplicated into a private store: the group reads
 *    the Host pin set directly.
 *
 * 2. Global panel (secondary, stable): the same data as a full page under the
 *    `main` keyed slot, reachable from the sidebar rail icon.
 *
 * The DOM seam is the one place this plugin touches structure it does not own.
 * It is anchored from the plugin's own panellist node (never from a global
 * selector), re-synchronised after React mutations, and harmless when the
 * expected nodes are missing: the page remains available.
 *
 * Module registration: the factory is registered under the current package id
 * plus the pre-rename `@local/dsh-pinned-panel` id. A profile that installed the
 * old package before the rename still asks the client loader for that id, and
 * the loader treats a module that registers a different id as a failure. The
 * second registration is inert once the legacy package is uninstalled.
 */
function dshPinnedPanelFactory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const PANEL_ID = 'pinned';
    const PAGE_ID = 'pinned-page';
    const NS = 'dsh-pinned-panel';
    const VERSION = '0.1.6';
    const SIDEBAR_HOST_CLASS = 'dpp-sb-host';
    const COLLAPSE_KEY = 'dsh-pinned-panel.sidebar.collapsed';

    const zh = {
      title: '置顶对话',
      sidebarTitle: '置顶',
      subtitle: '所有工作区里置顶的对话都集中在这里。点开任意一条，仍然回到它原来的工作区继续。',
      count: '条置顶',
      loading: '正在加载置顶对话…',
      emptyTitle: '还没有置顶的对话',
      emptyHint: '在左侧侧边栏任意对话行上点一下置顶按钮（📌），它就会出现在这里。',
      ungrouped: '未分组',
      defaultWorkspace: '默认工作区',
      newSession: '新对话',
      untitled: '未命名对话',
      unpin: '取消置顶',
      expand: '展开置顶',
      collapse: '收起置顶',
      openHint: '打开对话',
      jumpHint: '打开最近置顶的对话',
      more: '查看全部置顶对话',
    };

    const en = {
      title: 'Pinned conversations',
      sidebarTitle: 'Pinned',
      subtitle: 'Every pinned conversation from every workspace is collected here. Opening one returns to the workspace it belongs to.',
      count: 'pinned',
      loading: 'Loading pinned conversations…',
      emptyTitle: 'No pinned conversations yet',
      emptyHint: 'Pin a conversation from any sidebar row (📌) and it shows up here.',
      ungrouped: 'Ungrouped',
      defaultWorkspace: 'Default workspace',
      newSession: 'New conversation',
      untitled: 'Untitled conversation',
      unpin: 'Unpin',
      expand: 'Expand pinned',
      collapse: 'Collapse pinned',
      openHint: 'Open conversation',
      jumpHint: 'Open the most recently updated pinned conversation',
      more: 'Open the pinned page',
    };

    /* ------------------------------------------------------------------ *
     * Glyphs (original artwork composed from primitives)
     * ------------------------------------------------------------------ */

    const FOLDER = 'M3.5 7.2c0-.7.6-1.2 1.2-1.2h3.9l1.7 2.1h8c.7 0 1.2.6 1.2 1.2v7.9c0 .7-.6 1.2-1.2 1.2H4.7c-.7 0-1.2-.6-1.2-1.2z';
    const CHEVRON = 'M9 6l6 6-6 6';

    function pinGlyph(size, opacity) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false',
        style: { display: 'block', opacity: opacity === undefined ? 1 : opacity },
      }, [
        h('rect', { key: 'cap', x: 8, y: 3.4, width: 8, height: 3.1, rx: 1.55 }),
        h('path', { key: 'body', d: 'M9.6 7.6h4.8v4.3l1.5 2.3v1.5H8.1v-1.5l1.5-2.3z' }),
        h('rect', { key: 'stem', x: 11.4, y: 15.7, width: 1.2, height: 5.6, rx: 0.6 }),
      ]);
    }

    function folderGlyph(size) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
      }, h('path', { d: FOLDER }));
    }

    function chevronGlyph(size, open) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false',
        style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' },
      }, h('path', { d: CHEVRON }));
    }

    function closeGlyph(size) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', 'aria-hidden': 'true', focusable: 'false',
        style: { display: 'block' },
      }, [
        h('path', { key: 'a', d: 'M8 8l8 8' }),
        h('path', { key: 'b', d: 'M16 8l-8 8' }),
      ]);
    }

    /* ------------------------------------------------------------------ *
     * Pure helpers
     * ------------------------------------------------------------------ */

    /** Session summaries carry epoch milliseconds; accept strings defensively. */
    function toMillis(value) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1e12 ? value : value > 1e9 ? value * 1000 : value;
      }
      if (typeof value === 'string' && value.length > 0) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      }
      return Number.NaN;
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    /** Numeric, locale-neutral time: HH:mm today, MM-DD HH:mm this year, else the date. */
    function timeLabel(value) {
      const millis = toMillis(value);
      if (!Number.isFinite(millis)) return '';
      const date = new Date(millis);
      const now = new Date();
      const clock = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
      if (date.toDateString() === now.toDateString()) return clock;
      const day = pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
      if (date.getFullYear() === now.getFullYear()) return day + ' ' + clock;
      return date.getFullYear() + '-' + day + ' ' + clock;
    }

    function sessionIdOf(summary) {
      if (summary === undefined || summary === null) return '';
      if (typeof summary.id === 'string') return summary.id;
      if (typeof summary.sessionId === 'string') return summary.sessionId;
      return '';
    }

    function sessionTitle(summary, t) {
      if (summary === undefined || summary === null) return t('untitled');
      if (summary.blank === true) return t('newSession');
      const raw = summary.title !== undefined ? summary.title : summary.displayTitle;
      const text = typeof raw === 'string' ? raw.trim() : '';
      return text.length > 0 ? text : t('untitled');
    }

    function workspaceLabel(workspace, t) {
      if (workspace === undefined || workspace === null) return t('ungrouped');
      const stored = typeof workspace.title === 'string' ? workspace.title.trim() : '';
      if (stored.length > 0 && stored !== 'default-workspace') return stored;
      if (stored === 'default-workspace') return t('defaultWorkspace');
      const path = typeof workspace.path === 'string' ? workspace.path.trim() : '';
      return path.length > 0 ? path : t('ungrouped');
    }

    function byUpdatedDesc(left, right) {
      const delta = (toMillis(right.updatedAt) || 0) - (toMillis(left.updatedAt) || 0);
      if (delta !== 0 && Number.isFinite(delta)) return delta;
      return sessionIdOf(left).localeCompare(sessionIdOf(right));
    }

    /**
     * Partition the Host pin set by Workspace membership, keeping Workspace
     * order. Pinned Sessions with no owning Workspace fall into one trailing
     * group. Archived members are skipped: the Host keeps pin and archive
     * mutually exclusive, so this is only a guard against stale snapshots.
     */
    function groupPinned(items, pinnedSessionIds, byId, archivedSessionIds, t) {
      const pinned = pinnedSessionIds instanceof Set
        ? pinnedSessionIds
        : new Set(Array.isArray(pinnedSessionIds) ? pinnedSessionIds : []);
      const archived = archivedSessionIds instanceof Set
        ? archivedSessionIds
        : new Set(Array.isArray(archivedSessionIds) ? archivedSessionIds : []);
      const summaries = byId !== undefined && byId !== null ? byId : {};
      const placed = new Set();
      const groups = [];

      const collect = (ids) => {
        const members = [];
        for (const id of Array.isArray(ids) ? ids : []) {
          if (!pinned.has(id) || archived.has(id) || placed.has(id)) continue;
          const summary = summaries[id];
          if (summary === undefined) continue;
          placed.add(id);
          members.push(summary);
        }
        return members.sort(byUpdatedDesc);
      };

      for (const workspace of Array.isArray(items) ? items : []) {
        if (workspace === undefined || workspace === null) continue;
        const members = collect(workspace.sessionIds);
        if (members.length === 0) continue;
        groups.push({
          key: 'workspace:' + String(workspace.workspaceId),
          label: workspaceLabel(workspace, t),
          path: typeof workspace.path === 'string' ? workspace.path : '',
          members,
        });
      }

      const stray = [];
      for (const id of pinned) {
        if (placed.has(id) || archived.has(id)) continue;
        const summary = summaries[id];
        if (summary === undefined) continue;
        placed.add(id);
        stray.push(summary);
      }
      if (stray.length > 0) {
        groups.push({
          key: 'ungrouped',
          label: t('ungrouped'),
          path: '',
          members: stray.sort(byUpdatedDesc),
        });
      }

      return groups;
    }

    /** One flat, recently-updated-first list for the compact sidebar group. */
    function sidebarRows(items, pinnedSessionIds, byId, archivedSessionIds, t) {
      const pinned = new Set(Array.isArray(pinnedSessionIds) ? pinnedSessionIds : []);
      const archived = new Set(Array.isArray(archivedSessionIds) ? archivedSessionIds : []);
      const summaries = byId !== undefined && byId !== null ? byId : {};
      const labels = new Map();
      for (const workspace of Array.isArray(items) ? items : []) {
        if (workspace === undefined || workspace === null) continue;
        const label = workspaceLabel(workspace, t);
        for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) labels.set(id, label);
      }
      const rows = [];
      for (const id of pinned) {
        if (archived.has(id)) continue;
        const summary = summaries[id];
        if (summary === undefined) continue;
        rows.push({ summary, workspace: labels.get(id) || '' });
      }
      rows.sort((left, right) => byUpdatedDesc(left.summary, right.summary));
      return rows;
    }

    function readCollapsed() {
      try {
        return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
      } catch (error) {
        return false;
      }
    }

    function writeCollapsed(collapsed) {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, collapsed ? 'true' : 'false');
      } catch (error) {
        /* A private-mode browser may refuse storage; the in-memory state still works. */
      }
    }

    /* ------------------------------------------------------------------ *
     * Sidebar list seam: find the shipped browser's scroll container from
     * this plugin's own panellist node, then keep one host element first-child.
     * ------------------------------------------------------------------ */

    /** Return the build-hashed class token of an element whose suffix matches. */
    function classTokenEndingWith(element, suffix) {
      if (element === null || element === undefined) return null;
      const raw = typeof element.className === 'string' ? element.className : '';
      if (raw.length === 0) return null;
      for (const token of raw.split(/\s+/)) {
        if (token.length > suffix.length && token.endsWith(suffix) && /^[A-Za-z0-9_-]+$/.test(token)) return token;
      }
      return null;
    }

    function firstWithToken(root, suffix) {
      if (classTokenEndingWith(root, suffix) !== null) return root;
      for (const element of root.querySelectorAll('[class]')) {
        if (classTokenEndingWith(element, suffix) !== null) return element;
      }
      return null;
    }

    /** Walk up from our own node to the smallest ancestor holding the browser list area. */
    function findListArea(anchor) {
      let node = anchor;
      while (node !== null && node !== undefined && node !== document.body) {
        if (node.querySelector !== undefined) {
          const area = firstWithToken(node, '_listArea');
          if (area !== null) return area;
        }
        node = node.parentElement;
      }
      return null;
    }

    function findScrollList(area) {
      for (const element of area.querySelectorAll('[class]')) {
        /* The flat "In one list" view carries both tokens; a pinned group only
           makes sense above the grouped workspace sections. */
        if (classTokenEndingWith(element, '_flatList') !== null) continue;
        if (classTokenEndingWith(element, '_list') !== null) return element;
      }
      return null;
    }

    function installSidebarHost(anchor, publish) {
      if (anchor === null || anchor === undefined) return () => {};
      let host = null;
      let cachedList = null;
      let observed = null;
      let observer = null;
      let frame = 0;
      let disposed = false;
      let seamFound = false;

      const listOf = (area) => {
        if (cachedList !== null && cachedList.isConnected && area.contains(cachedList)) return cachedList;
        cachedList = findScrollList(area);
        return cachedList;
      };

      const sync = () => {
        frame = 0;
        if (disposed) return;
        const area = findListArea(anchor);
        if (area === null) {
          if (host !== null && host.parentNode !== null) host.parentNode.removeChild(host);
          return;
        }
        seamFound = true;
        if (area !== observed) {
          if (observer !== null) observer.disconnect();
          observed = area;
          observer = new MutationObserver(schedule);
          observer.observe(area, { childList: true, subtree: true });
        }
        const list = listOf(area);
        if (list === null) {
          if (host !== null && host.parentNode !== null) host.parentNode.removeChild(host);
          return;
        }
        if (host === null) {
          host = document.createElement('div');
          host.className = SIDEBAR_HOST_CLASS;
          host.setAttribute('role', 'group');
          host.setAttribute('data-dsh-pinned-panel', '');
          publish(host);
        }
        if (host.parentNode !== list || list.firstElementChild !== host) {
          list.insertBefore(host, list.firstChild);
        }
        /* Adopt the shipped group wrapper class so the native
           `.groupSection + .groupSection` spacing applies to the next group. */
        const next = host.nextElementSibling;
        const groupToken = classTokenEndingWith(next, '_groupSection');
        const className = groupToken === null ? SIDEBAR_HOST_CLASS : SIDEBAR_HOST_CLASS + ' ' + groupToken;
        if (host.className !== className) host.className = className;
      };

      const schedule = () => {
        if (disposed || frame !== 0) return;
        frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(sync) : setTimeout(sync, 16);
      };

      sync();
      const timer = setInterval(sync, 800);
      const diagnosis = setTimeout(() => {
        if (disposed || seamFound) return;
        console.warn('[dsh-pinned-panel] sidebar list seam not found; the Pinned page in the sidebar rail still works.');
      }, 4000);

      return () => {
        disposed = true;
        clearInterval(timer);
        clearTimeout(diagnosis);
        if (frame !== 0) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
          clearTimeout(frame);
        }
        if (observer !== null) observer.disconnect();
        if (host !== null && host.parentNode !== null) host.parentNode.removeChild(host);
        publish(null);
      };
    }

    /* ------------------------------------------------------------------ *
     * Sidebar group (injected into the shipped list)
     * ------------------------------------------------------------------ */

    const SIDEBAR_CSS = [
      '.dpp-sb-wrap{display:block;}',
      '.dpp-sb-host{display:block;}',
      '.dpp-sb-header{box-sizing:border-box;display:flex;align-items:center;gap:6px;height:34px;padding:0 8px;border-radius:var(--dsw-radius-md);cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);background:transparent;border:0;width:100%;font:inherit;text-align:left;}',
      '.dpp-sb-header:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dpp-sb-header:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;}',
      '.dpp-sb-slot{width:16px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);}',
      '.dpp-sb-header .dpp-sb-chevron{display:none;}',
      '.dpp-sb-header:hover .dpp-sb-chevron,.dpp-sb-header:focus-visible .dpp-sb-chevron{display:inline-flex;}',
      '.dpp-sb-header:hover .dpp-sb-pin,.dpp-sb-header:focus-visible .dpp-sb-pin{display:none;}',
      '.dpp-sb-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;}',
      '.dpp-sb-badge{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:0;padding:0 3px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;font-family:inherit;}',
      '.dpp-sb-badge:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dpp-sb-badge:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;}',
      '.dpp-sb-rows{display:block;}',
      '.dpp-sb-row{box-sizing:border-box;display:flex;align-items:center;gap:0;height:32px;padding:0 8px;border-radius:var(--dsw-radius-md);cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);background:transparent;border:0;width:100%;font:inherit;text-align:left;}',
      '.dpp-sb-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dpp-sb-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;}',
      '.dpp-sb-row .dpp-sb-slot{color:var(--dsw-alias-state-business-primary);}',
      '.dpp-sb-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;margin:0 6px 0 4px;}',
      '.dpp-sb-ws{flex:none;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:16px;color:var(--dsw-alias-label-caption);margin-inline-end:6px;}',
      '.dpp-sb-time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
      '.dpp-sb-ver{flex:none;font-size:9px;line-height:16px;color:var(--dsw-alias-label-tertiary);opacity:.6;}',
      '.dpp-sb-unpin{display:none;flex:none;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;align-items:center;justify-content:center;}',
      '.dpp-sb-row:hover .dpp-sb-time,.dpp-sb-row:hover .dpp-sb-ws{display:none;}',
      '.dpp-sb-row:hover .dpp-sb-unpin,.dpp-sb-row:focus-within .dpp-sb-unpin{display:inline-flex;}',
      '.dpp-sb-unpin:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-state-error-primary);}',
      '.dpp-sb-loading{padding:6px 8px;color:var(--dsw-alias-label-tertiary);font-size:13px;}',
    ].join('');

    function SidebarRow(props) {
      const t = props.t;
      const summary = props.summary;
      const id = sessionIdOf(summary);
      const title = sessionTitle(summary, t);
      const time = timeLabel(summary.updatedAt);
      const tip = props.workspace.length > 0 ? title + ' · ' + props.workspace : title;
      const activate = (event) => {
        if (event !== undefined && event !== null && typeof event.stopPropagation === 'function') event.stopPropagation();
        console.info('[dsh-pinned-panel] open group', id, JSON.stringify(title));
        props.open(id);
      };
      return h('div', {
        className: 'dpp-sb-row',
        role: 'button',
        tabIndex: 0,
        title: tip,
        onClick: activate,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            activate(event);
          }
        },
      }, [
        h('span', { className: 'dpp-sb-slot', key: 'pin', 'aria-hidden': 'true' }, pinGlyph(13)),
        h('span', { className: 'dpp-sb-title', key: 'title' }, title),
        props.workspace.length > 0
          ? h('span', { className: 'dpp-sb-ws', key: 'ws', title: props.workspace }, props.workspace)
          : null,
        time.length > 0 ? h('span', { className: 'dpp-sb-time', key: 'time' }, time) : null,
        h('button', {
          type: 'button',
          className: 'dpp-sb-unpin',
          key: 'unpin',
          title: t('unpin'),
          'aria-label': t('unpin'),
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            props.unpin(id);
          },
        }, closeGlyph(12)),
      ]);
    }

    function SidebarGroup(props) {
      const t = props.t;
      const rows = props.rows;
      const collapsed = props.collapsed;
      if (rows.length === 0) return null;
      return h(React.Fragment, null, [
        h('button', {
          type: 'button',
          className: 'dpp-sb-header',
          key: 'header',
          'aria-expanded': collapsed ? 'false' : 'true',
          title: collapsed ? t('expand') : t('collapse'),
          onClick: (event) => {
            event.stopPropagation();
            props.toggle();
          },
        }, [
          h('span', { className: 'dpp-sb-slot dpp-sb-chevron', key: 'chevron', 'aria-hidden': 'true' }, chevronGlyph(13, !collapsed)),
          h('span', { className: 'dpp-sb-slot dpp-sb-pin', key: 'pin', 'aria-hidden': 'true' }, pinGlyph(13)),
          h('span', { className: 'dpp-sb-label', key: 'label' }, t('sidebarTitle')),
          h('button', {
            type: 'button',
            className: 'dpp-sb-badge',
            key: 'badge',
            title: t('more'),
            'aria-label': t('more'),
            onClick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              props.openPage();
            },
          }, String(rows.length)),
          h('span', { className: 'dpp-sb-ver', key: 'ver' }, 'v' + VERSION),
        ]),
        collapsed
          ? null
          : h('div', { className: 'dpp-sb-rows', key: 'rows', role: 'group' }, rows.map((row) => h(SidebarRow, {
            key: sessionIdOf(row.summary),
            summary: row.summary,
            workspace: row.workspace,
            t,
            open: props.open,
            unpin: props.unpin,
          }))),
      ]);
    }

    /**
     * Always-mounted seat in the sidebar icon rail: draws the rail glyph and
     * portals the pinned group into the shipped session list. It disappears from
     * the list when nothing is pinned, and keeps working when the seam moves.
     */
    function PinnedSidebarSeat(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : readEmpty;
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : readEmpty;
      const anchorRef = React.useRef(null);
      const [host, setHost] = React.useState(null);
      const [collapsed, setCollapsed] = React.useState(readCollapsed);

      const items = useWorkspaces((state) => state.items);
      const pinnedSessionIds = useWorkspaces((state) => state.pinnedSessionIds);
      const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
      const byId = useSessions((state) => state.byId);
      const rows = sidebarRows(items, pinnedSessionIds, byId, archivedSessionIds, t);
      const rowsSignature = rows.map((row) => sessionIdOf(row.summary)).join('|');
      const lastSignature = React.useRef('');
      if (rowsSignature !== lastSignature.current) {
        lastSignature.current = rowsSignature;
        console.info('[dsh-pinned-panel] group rows', rowsSignature);
      }

      React.useEffect(() => installSidebarHost(anchorRef.current, setHost), []);

      const toggle = () => {
        setCollapsed((previous) => {
          const next = !previous;
          writeCollapsed(next);
          return next;
        });
      };

      return h(React.Fragment, null, [
        h('span', {
          key: 'icon',
          ref: anchorRef,
          title: rows.length > 0 ? t('jumpHint') : t('title'),
          style: { display: 'inline-flex' },
        }, pinGlyph(typeof props.size === 'number' && props.size > 0 ? props.size : 16, props.active === true ? 1 : 0.92)),
        host !== null
          ? ReactDOM.createPortal(h('div', {
            className: 'dpp-sb-wrap',
            /* Portaled children still bubble through the REACT tree, and this
               portal hangs under the shell's panel button: without this stop, a
               click on a row would also select the Pinned panel, whose redirect
               would then yank the main column back to the newest pinned row. */
            onClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => event.stopPropagation(),
            onPointerDown: (event) => event.stopPropagation(),
          }, h(SidebarGroup, {
            rows,
            collapsed,
            toggle,
            t,
            open: openSessionById,
            unpin: unpinSessionById,
            openPage: openPinnedPage,
          })), host, 'dsh-pinned-panel-sidebar')
          : null,
      ]);
    }

    /* ------------------------------------------------------------------ *
     * Main panel page (stable fallback surface)
     * ------------------------------------------------------------------ */

    const EMPTY_SNAPSHOT = {
      items: [],
      pinnedSessionIds: [],
      archivedSessionIds: [],
      phase: 'ready',
      state: 'ready',
      byId: {},
    };

    function readEmpty(select) {
      return select(EMPTY_SNAPSHOT);
    }

    /* Application operations shared by both surfaces. The client context is
       captured in `apply` instead of reaching the components through slot
       `inject` faces: the panellist declaration does not advertise an inject
       face, and the shipped entries for that slot pass none. */
    let client = null;

    /** Session currently retained as the conversation's main view, if known. */
    function retainedMainSessionId() {
      if (client === null) return undefined;
      try {
        const state = client.sessions.list.getSnapshot();
        const byId = state !== undefined && state !== null && state.byId !== undefined ? state.byId : {};
        for (const key of Object.keys(byId)) {
          const summary = byId[key];
          const retained = summary !== null && summary !== undefined && summary.retainedBy !== undefined
            ? summary.retainedBy.mainView
            : 0;
          if (typeof retained === 'number' && retained > 0) return summary.id !== undefined ? summary.id : key;
        }
      } catch (error) {
        /* The retention snapshot is advisory; a failure only disables the check. */
      }
      return undefined;
    }

    function openSessionById(sessionId) {
      if (client === null || typeof sessionId !== 'string' || sessionId.length === 0) {
        console.warn('[dsh-pinned-panel] open skipped', sessionId, client === null ? 'no client' : 'bad id');
        return false;
      }
      try {
        client.uiWorkspace.openSession(sessionId);
        console.info('[dsh-pinned-panel] openSession called', sessionId);
      } catch (error) {
        client.logger.warn(`dsh-pinned-panel: could not open the Session: ${error instanceof Error ? error.message : String(error)}`);
        console.warn('[dsh-pinned-panel] openSession threw', sessionId, error instanceof Error ? error.message : String(error));
        return false;
      }
      /* Verify the navigation landed. The shipped `openSession` is the official
         entry, but a call made from an injected subtree can be superseded; when the
         main view is not the requested Session, click the app's own row for it
         (same handler the sidebar uses). Clicking the intended row twice is
         harmless, so a false mismatch costs nothing. */
      setTimeout(() => {
        if (client === null) return;
        if (retainedMainSessionId() === sessionId) return;
        const row = document.querySelector('[data-row-key="session:' + sessionId + '"]');
        console.info('[dsh-pinned-panel] navigation mismatch, native row:', row !== null, sessionId);
        if (row !== null && typeof row.click === 'function') {
          try {
            row.click();
          } catch (error) {
            console.warn('[dsh-pinned-panel] native row click failed:', error);
          }
        }
      }, 120);
      return true;
    }

    function unpinSessionById(sessionId) {
      if (client === null || typeof sessionId !== 'string' || sessionId.length === 0) return;
      const uiWorkspace = client.uiWorkspace;
      if (typeof uiWorkspace.unpinSession !== 'function') {
        client.logger.warn('dsh-pinned-panel: this Harness build does not expose unpinSession');
        return;
      }
      try {
        Promise.resolve(uiWorkspace.unpinSession(sessionId)).catch((error) => {
          client.logger.warn(`dsh-pinned-panel: unpin failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      } catch (error) {
        client.logger.warn(`dsh-pinned-panel: unpin failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    /** Select the grouped Pinned page in the main column. */
    function openPinnedPage() {
      if (client === null) return;
      try {
        client.layout.selectPanel(PAGE_ID);
      } catch (error) {
        client.logger.warn(`dsh-pinned-panel: could not open the Pinned page: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    function EmptyState(props) {
      const t = props.t;
      return h('div', { className: 'dpp-empty' }, [
        h('span', { className: 'dpp-emptyIcon', key: 'icon' }, pinGlyph(28, 0.45)),
        h('p', { className: 'dpp-emptyTitle', key: 'title' }, t('emptyTitle')),
        h('p', { className: 'dpp-emptyHint', key: 'hint' }, t('emptyHint')),
      ]);
    }

    function PinnedRow(props) {
      const summary = props.summary;
      const t = props.t;
      const id = sessionIdOf(summary);
      const title = sessionTitle(summary, t);
      const time = timeLabel(summary.updatedAt);
      const activate = () => {
        console.info('[dsh-pinned-panel] open page', id, JSON.stringify(title));
        props.open(id);
      };
      return h('div', {
        className: 'dpp-row',
        role: 'button',
        tabIndex: 0,
        title,
        onClick: activate,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            activate();
          }
        },
      }, [
        h('span', { className: 'dpp-pin', key: 'pin', 'aria-hidden': 'true' }, pinGlyph(14)),
        h('span', { className: 'dpp-rowTitle', key: 'title' }, title),
        time.length > 0 ? h('span', { className: 'dpp-rowTime', key: 'time' }, time) : null,
        h('button', {
          type: 'button',
          className: 'dpp-unpin',
          key: 'unpin',
          title: t('unpin'),
          'aria-label': t('unpin'),
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            props.unpin(id);
          },
        }, closeGlyph(13)),
      ]);
    }

    function PinnedGroup(props) {
      const group = props.group;
      return h('section', { className: 'dpp-group', key: group.key }, [
        h('div', { className: 'dpp-groupHead', key: 'head' }, [
          h('span', { className: 'dpp-folder', key: 'folder', 'aria-hidden': 'true' }, folderGlyph(14)),
          h('span', { className: 'dpp-groupTitle', key: 'label' }, group.label),
          group.path.length > 0 && group.path !== group.label
            ? h('span', { className: 'dpp-groupPath', key: 'path', title: group.path }, group.path)
            : null,
        ]),
        h('div', { className: 'dpp-groupRows', key: 'rows' }, group.members.map((summary) => h(PinnedRow, {
          key: sessionIdOf(summary),
          summary,
          t: props.t,
          open: props.open,
          unpin: props.unpin,
        }))),
      ]);
    }

    const PANEL_CSS = [
      '.dpp-page{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);display:flex;flex-direction:column;height:100%;min-height:0;}',
      '.dpp-header{display:flex;flex-direction:column;gap:4px;padding:18px 20px 14px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:0 0 auto;}',
      '.dpp-titleRow{display:flex;align-items:center;gap:10px;min-width:0;}',
      '.dpp-title{font:var(--dsw-font-m-18);font-weight:600;margin:0;}',
      '.dpp-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:1px 8px;white-space:nowrap;}',
      '.dpp-subtitle{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:0;}',
      '.dpp-body{flex:1;min-height:0;padding:14px 20px 40px;overflow:auto;}',
      '.dpp-inner{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:20px;}',
      '.dpp-group{display:flex;flex-direction:column;gap:2px;min-width:0;}',
      '.dpp-groupHead{display:flex;align-items:center;gap:8px;padding:4px 6px 6px;min-width:0;}',
      '.dpp-folder{display:inline-flex;color:var(--dsw-alias-label-tertiary);flex:0 0 auto;}',
      '.dpp-groupTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%;}',
      '.dpp-groupPath{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}',
      '.dpp-groupRows{display:flex;flex-direction:column;gap:1px;min-width:0;}',
      '.dpp-row{display:flex;align-items:center;gap:10px;min-width:0;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;}',
      '.dpp-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dpp-row:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px;}',
      '.dpp-pin{display:inline-flex;color:var(--dsw-alias-brand-primary);flex:0 0 auto;}',
      '.dpp-rowTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dpp-rowTime{flex:0 0 auto;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      '.dpp-unpin{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:0;transition:opacity .12s ease,color .12s ease,background-color .12s ease;}',
      '.dpp-row:hover .dpp-unpin,.dpp-row:focus-within .dpp-unpin{opacity:1;}',
      '.dpp-unpin:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-state-error-primary);}',
      '.dpp-unpin:focus-visible{opacity:1;outline:2px solid var(--dsw-alias-link);outline-offset:1px;}',
      '.dpp-loading{color:var(--dsw-alias-label-secondary);padding:56px 20px;text-align:center;}',
      '.dpp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:72px 20px;text-align:center;color:var(--dsw-alias-label-secondary);}',
      '.dpp-emptyIcon{display:inline-flex;color:var(--dsw-alias-label-tertiary);}',
      '.dpp-emptyTitle{font:var(--dsw-font-base-16);font-weight:600;color:var(--dsw-alias-label-primary);margin:2px 0 0;}',
      '.dpp-emptyHint{font-size:13px;line-height:20px;margin:0;max-width:460px;}',
      '@media (width <= 720px){.dpp-body{padding:12px 12px 32px;}.dpp-header{padding:14px 12px 12px;}}',
    ].join('');

    function PinnedPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : readEmpty;
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : readEmpty;

      const workspaceReady = useWorkspaces((state) => state.phase === 'ready');
      const items = useWorkspaces((state) => state.items);
      const pinnedSessionIds = useWorkspaces((state) => state.pinnedSessionIds);
      const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
      const sessionsReady = useSessions((state) => state.phase === 'ready');
      const byId = useSessions((state) => state.byId);

      const groups = groupPinned(items, pinnedSessionIds, byId, archivedSessionIds, t);
      const pinnedCount = Array.isArray(pinnedSessionIds) ? pinnedSessionIds.length : 0;
      const open = typeof props.open === 'function' ? props.open : openSessionById;
      const unpin = typeof props.unpin === 'function' ? props.unpin : unpinSessionById;

      let body;
      if (groups.length > 0) {
        body = h('div', { className: 'dpp-inner' }, groups.map((group) => h(PinnedGroup, {
          key: group.key,
          group,
          t,
          open,
          unpin,
        })));
      } else if (!workspaceReady || !sessionsReady || pinnedCount > 0) {
        body = h('div', { className: 'dpp-loading' }, t('loading'));
      } else {
        body = h(EmptyState, { t });
      }

      return h('div', { className: 'dpp-page' }, [
        h('style', { key: 'style' }, PANEL_CSS),
        h('header', { className: 'dpp-header', key: 'header' }, [
          h('div', { className: 'dpp-titleRow', key: 'row' }, [
            h('h1', { className: 'dpp-title', key: 'title' }, t('title')),
            pinnedCount > 0
              ? h('span', { className: 'dpp-count', key: 'count' }, pinnedCount + ' ' + t('count'))
              : null,
          ]),
          h('p', { className: 'dpp-subtitle', key: 'subtitle' }, t('subtitle')),
        ]),
        h('div', { className: 'dpp-body', key: 'body' }, body),
      ]);
    }

    /**
     * Rail entry target. The shell owns the icon button and selects this panel on
     * click, so a click handler cannot be attached to it. With anything pinned the
     * entry is a one-click redirect: it opens the most recently updated pinned
     * conversation from a layout effect, before the browser paints. With nothing
     * pinned it renders the grouped Pinned page (and its empty-state guidance).
     */
    function PinnedRoute(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : readEmpty;
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : readEmpty;
      const items = useWorkspaces((state) => state.items);
      const pinnedSessionIds = useWorkspaces((state) => state.pinnedSessionIds);
      const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
      const byId = useSessions((state) => state.byId);
      const rows = sidebarRows(items, pinnedSessionIds, byId, archivedSessionIds, t);
      const target = rows.length > 0 ? sessionIdOf(rows[0].summary) : '';
      const jumped = React.useRef(false);
      const [failed, setFailed] = React.useState(false);

      React.useLayoutEffect(() => {
        if (jumped.current || target.length === 0) return;
        jumped.current = true;
        if (!openSessionById(target)) setFailed(true);
      }, [target]);

      /* Safety net: if the redirect somehow does not replace this panel, show the
         grouped page instead of leaving the main column blank. */
      React.useEffect(() => {
        if (target.length === 0) return undefined;
        const timer = setTimeout(() => setFailed(true), 800);
        return () => clearTimeout(timer);
      }, [target]);

      if (target.length > 0 && !failed) return null;
      return h(PinnedPanel, props);
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-pinned-panel: dictionaries');
        /* The injected sidebar group renders outside this plugin's React tree, so
           its stylesheet is registered once with the plugin's own lifetime. */
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {};
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-pinned-panel';
          tag.dataset.pluginCss = 'dsh-pinned-panel/sidebar-group.css';
          tag.textContent = SIDEBAR_CSS;
          document.head.appendChild(tag);
          return () => {
            if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
          };
        }, 'dsh-pinned-panel: sidebar group styles');
        const t = ctx.locale.bind(NS);
        client = ctx;
        console.info(`[dsh-pinned-panel] active v${VERSION}`);
        ctx.effect(() => () => {
          client = null;
        }, 'dsh-pinned-panel: client operations');

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ open: openSessionById, unpin: unpinSessionById }),
        }, PinnedRoute));

        /* The grouped page has its own key so the count in the sidebar group can
           open it without passing through the rail entry's redirect. */
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PAGE_ID,
          locale: NS,
          inject: () => ({ open: openSessionById, unpin: unpinSessionById }),
        }, PinnedPanel));

        /* The same seat both draws the rail glyph and owns the injected sidebar
           group, so the group exists while the sidebar is shown without adding a
           second registration surface. */
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 5,
          locale: NS,
          label: () => t('title'),
        }, PinnedSidebarSeat));
      },
    };
}

/* Register both ids (see the module doc): the current package id and the
   pre-rename `@local/dsh-pinned-panel` id a profile may still be asking the
   client loader for. Registering the second id is inert otherwise. */
window.__ModuleLoader__.load({ id: 'dsh-pinned-panel', factory: dshPinnedPanelFactory });
window.__ModuleLoader__.load({ id: '@local/dsh-pinned-panel', factory: dshPinnedPanelFactory });
