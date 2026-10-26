/**
 * dsh-pinned-panel — a Pinned group at the top of the DSH Web sidebar.
 *
 * One surface only: the shipped Workspace browser occupies the single
 * `sidebar.workspaces` slot, so a plugin has no slot to add a group inside its
 * list. This plugin mounts one invisible seat in the sidebar shell
 * (`sidebar.footer.action`, which renders beside Settings) — the seat draws
 * nothing — and from that seat's own DOM node walks up to the browser's scroll
 * container, inserts one host element as the list's first child, and portals a
 * "Pinned" group into it.
 *
 * The group is expanded by default, uses the shipped row metrics (32px rows,
 * 34px header, the app's radius/hover tokens), and opens rows through the
 * official `uiWorkspace.openSession()` so a conversation keeps running in its
 * original workspace. Rows are never duplicated into a private store: the group
 * reads the Host pin set directly.
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

    const SEAT_ID = 'pinned-group';
    const NS = 'dsh-pinned-panel';
    const VERSION = '0.3.0';
    const SIDEBAR_HOST_CLASS = 'dpp-sb-host';
    const COLLAPSE_KEY = 'dsh-pinned-panel.sidebar.collapsed';

    const zh = {
      sidebarTitle: '置顶',
      ungrouped: '未分组',
      defaultWorkspace: '默认工作区',
      newSession: '新对话',
      untitled: '未命名对话',
      unpin: '取消置顶',
      expand: '展开置顶',
      collapse: '收起置顶',
    };

    const en = {
      sidebarTitle: 'Pinned',
      ungrouped: 'Ungrouped',
      defaultWorkspace: 'Default workspace',
      newSession: 'New conversation',
      untitled: 'Untitled conversation',
      unpin: 'Unpin',
      expand: 'Expand pinned',
      collapse: 'Collapse pinned',
    };

    /* ------------------------------------------------------------------ *
     * Glyphs (original artwork composed from primitives)
     * ------------------------------------------------------------------ */

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
     * Sidebar list seam: find the shipped browser's scroll container from the
     * seat's own node, then keep one host element as the list's first child.
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

    /** Walk up from the seat to the smallest ancestor holding the browser list area. */
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
      let cachedArea = null;
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
        /* The walk from the seat reaches the frame root, so cache the located
           area: an unrelated mutation must not rescan the whole document. */
        const area = cachedArea !== null && cachedArea.isConnected ? cachedArea : findListArea(anchor);
        cachedArea = area;
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
        console.warn('[dsh-pinned-panel] sidebar list seam not found; the Pinned group cannot be placed.');
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
      '.dpp-sb-badge{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
      '.dpp-sb-rows{display:block;}',
      '.dpp-sb-row{box-sizing:border-box;display:flex;align-items:center;gap:0;height:32px;padding:0 8px;border-radius:var(--dsw-radius-md);cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);background:transparent;border:0;width:100%;font:inherit;text-align:left;}',
      '.dpp-sb-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dpp-sb-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;}',
      '.dpp-sb-row .dpp-sb-slot{color:var(--dsw-alias-state-business-primary);}',
      '.dpp-sb-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;margin:0 6px 0 4px;}',
      '.dpp-sb-ws{flex:none;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:16px;color:var(--dsw-alias-label-caption);margin-inline-end:6px;}',
      '.dpp-sb-time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
      '.dpp-sb-unpin{display:none;flex:none;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;align-items:center;justify-content:center;}',
      '.dpp-sb-row:hover .dpp-sb-time,.dpp-sb-row:hover .dpp-sb-ws{display:none;}',
      '.dpp-sb-row:hover .dpp-sb-unpin,.dpp-sb-row:focus-within .dpp-sb-unpin{display:inline-flex;}',
      '.dpp-sb-unpin:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-state-error-primary);}',
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
          h('span', { className: 'dpp-sb-badge', key: 'badge' }, String(rows.length)),
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
     * Invisible seat in the sidebar shell: it renders nothing (the footer action
     * row tolerates an empty occupant) and portals the pinned group into the
     * shipped session list. Its node lives inside the sidebar column, so the
     * ancestor walk to the list area stays cheap and cannot miss the sidebar.
     */
    function PinnedSeat(props) {
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

      React.useEffect(() => installSidebarHost(anchorRef.current, setHost), []);

      const toggle = () => {
        setCollapsed((previous) => {
          const next = !previous;
          writeCollapsed(next);
          return next;
        });
      };

      return h(React.Fragment, null, [
        h('span', { key: 'anchor', ref: anchorRef, style: { display: 'none' }, 'aria-hidden': 'true' }),
        host !== null
          ? ReactDOM.createPortal(h('div', {
            className: 'dpp-sb-wrap',
            /* Portaled children bubble through the REACT tree; keep the group's
               interactions from reaching any host seat it is mounted under. */
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
          })), host, 'dsh-pinned-panel-sidebar')
          : null,
      ]);
    }

    /* ------------------------------------------------------------------ *
     * Application operations (called by the group's rows)
     * ------------------------------------------------------------------ */

    const EMPTY_SNAPSHOT = {
      items: [],
      pinnedSessionIds: [],
      archivedSessionIds: [],
      phase: 'ready',
      byId: {},
    };

    function readEmpty(select) {
      return select(EMPTY_SNAPSHOT);
    }

    /* The client context is captured in `apply` instead of reaching the component
       through a slot inject face: the overlay entry only needs the standard props. */
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
      if (client === null || typeof sessionId !== 'string' || sessionId.length === 0) return false;
      try {
        client.uiWorkspace.openSession(sessionId);
      } catch (error) {
        client.logger.warn(`dsh-pinned-panel: could not open the Session: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
      /* Verify the navigation landed: the official call is made from an injected
         subtree, so when the main view is not the requested Session, click the
         app's own row for it (the exact handler the sidebar uses). Clicking the
         intended row twice is harmless. */
      setTimeout(() => {
        if (client === null) return;
        if (retainedMainSessionId() === sessionId) return;
        const row = document.querySelector('[data-row-key="session:' + sessionId + '"]');
        if (row !== null && typeof row.click === 'function') {
          try {
            row.click();
          } catch (error) {
            console.warn('[dsh-pinned-panel] native row click failed', error);
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

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-pinned-panel: dictionaries');
        /* The injected group renders outside this plugin's React tree, so its
           stylesheet is registered once with the plugin's own lifetime. */
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

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: SEAT_ID,
          order: 90,
          locale: NS,
        }, PinnedSeat));
      },
    };
}

/* Register both ids (see the module doc): the current package id and the
   pre-rename `@local/dsh-pinned-panel` id a profile may still be asking the
   client loader for. Registering the second id is inert otherwise. */
window.__ModuleLoader__.load({ id: 'dsh-pinned-panel', factory: dshPinnedPanelFactory });
window.__ModuleLoader__.load({ id: '@local/dsh-pinned-panel', factory: dshPinnedPanelFactory });
