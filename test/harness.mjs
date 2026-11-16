// Loads lib/client.js in a sandbox and returns its test-only pure helpers.
// The bundle is a plain script: its only global is window.__ModuleLoader__, which
// captures the factories. A fake React/ReactDOM is enough because the factory body
// defines components without calling them.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function stubReact() {
  const hookValue = (initial) => (typeof initial === 'function' ? initial() : initial);
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: Symbol('Fragment'),
    useState: (initial) => [hookValue(initial), () => {}],
    useRef: (initial) => ({ current: initial === undefined ? null : initial }),
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
  };
}

export function loadHooks() {
  const source = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');
  const factories = new Map();

  const documentStub = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
    createElement: () => ({ dataset: {}, style: {}, setAttribute: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const windowStub = {
    __ModuleLoader__: { load: ({ id, factory }) => factories.set(id, factory) },
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 800,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false }),
    document: documentStub,
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: {},
    __DSH_PINNED_PANEL_TEST__: true,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' });

  const factory = factories.get('dsh-pinned-panel');
  if (typeof factory !== 'function') throw new Error('client bundle did not register dsh-pinned-panel');

  const react = stubReact();
  factory((name) => {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: (node) => node };
    throw new Error(`unexpected require(${JSON.stringify(name)})`);
  });

  const hooks = sandbox.__DSH_PINNED_PANEL_HOOKS__;
  if (hooks === undefined) throw new Error('test hooks were not exported; set __DSH_PINNED_PANEL_TEST__ before loading');
  return hooks;
}
