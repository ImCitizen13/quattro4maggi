/**
 * dialStore — app half of the Dials DevTools bridge (panel half:
 * plugins/rozenite-plugin-dialkit/src/panel.tsx).
 *
 * FLOW:
 *   useDials mounts ─► retain(id) ─► register sent once the DevTools client exists
 *   panel ─► values ─► entry.values ─► listeners (React re-render or SharedValue write)
 *   panel ─► ready (opened / reloaded) ─► every live registration is re-sent
 *   panel ─► action ─► entry action handlers
 *   last user unmounts ─► unregister (tuned values kept in memory for the next mount)
 *
 * KEY FEATURES:
 * - Dev only: every entry point returns early when !__DEV__, and the bridge is
 *   required behind a `__DEV__ ? … : null` expression so Metro drops it from
 *   release bundles
 * - One lazy client for the whole app, no provider to mount
 * - The client promise resolves only when React Native DevTools opens; until
 *   then hooks render their config defaults
 * - Web / no DevTools: the client rejects and the store stays inert
 */
import type { RozeniteDevToolsClient } from "@rozenite/plugin-bridge";
import type { DialConfig } from "dialkit";
import type { DialEvents, DialValuesPayload } from "rozenite-plugin-dialkit/protocol";

// ============================================================================
// Types
// ============================================================================

type Client = RozeniteDevToolsClient<DialEvents>;
type ValuesListener = (values: DialValuesPayload) => void;
type ActionListener = (path: string) => void;

type Entry = {
  name: string;
  config: DialConfig;
  refs: number;
  revision: number;
  valueListeners: Set<ValuesListener>;
  actionListeners: Set<ActionListener>;
};

// ============================================================================
// State
// ============================================================================

/** Must equal the plugin package name (protocol.ts PLUGIN_ID). */
const PLUGIN_ID = "rozenite-plugin-dialkit";

const entries = new Map<string, Entry>();
/** Last values per id; outlives unmounts so a remount resumes the tuned state. */
const latestValues = new Map<string, DialValuesPayload>();

let client: Client | null = null;
let connecting = false;

// ============================================================================
// Bridge
// ============================================================================

const sendRegister = (id: string, entry: Entry) => {
  entry.revision += 1;
  client?.send("register", {
    id,
    name: entry.name,
    config: entry.config,
    revision: entry.revision,
  });
};

// A `__DEV__ ? … : null` expression is what Metro constant-folds away in release
// builds; a require placed after an early `if (!__DEV__) return` is NOT removed.
const loadBridge = __DEV__
  ? () =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@rozenite/plugin-bridge") as typeof import("@rozenite/plugin-bridge")
  : null;

const connect = () => {
  if (!loadBridge || connecting || client) return;
  connecting = true;

  loadBridge()
    .getRozeniteDevToolsClient<DialEvents>(PLUGIN_ID)
    .then((next) => {
      client = next;
      next.onMessage("ready", () => entries.forEach((entry, id) => sendRegister(id, entry)));
      next.onMessage("values", ({ id, values }) => {
        latestValues.set(id, values);
        entries.get(id)?.valueListeners.forEach((listener) => listener(values));
      });
      next.onMessage("action", ({ id, path }) => {
        entries.get(id)?.actionListeners.forEach((listener) => listener(path));
      });
      entries.forEach((entry, id) => sendRegister(id, entry));
    })
    .catch(() => {
      // Web, or Rozenite not enabled (`bun run start:dials`): dials stay at defaults.
      connecting = false;
    });
};

// ============================================================================
// Public store API
// ============================================================================

/** Start (or keep) publishing a dial set. Returns the release function. */
export const retainDials = (id: string, name: string, config: DialConfig): (() => void) => {
  if (!__DEV__) return () => {};
  const existing = entries.get(id);
  const entry: Entry = existing ?? {
    name,
    config,
    refs: 0,
    revision: 0,
    valueListeners: new Set(),
    actionListeners: new Set(),
  };
  entry.refs += 1;
  entry.name = name;
  entry.config = config;
  entries.set(id, entry);
  connect();
  sendRegister(id, entry);

  return () => {
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entries.delete(id);
    client?.send("unregister", { id });
  };
};

export const getDialValues = (id: string): DialValuesPayload | undefined =>
  latestValues.get(id);

export const subscribeDialValues = (id: string, listener: ValuesListener): (() => void) => {
  const entry = entries.get(id);
  if (!entry) return () => {};
  entry.valueListeners.add(listener);
  return () => entry.valueListeners.delete(listener);
};

export const subscribeDialActions = (id: string, listener: ActionListener): (() => void) => {
  const entry = entries.get(id);
  if (!entry) return () => {};
  entry.actionListeners.add(listener);
  return () => entry.actionListeners.delete(listener);
};

/** Push app-side edits (e.g. an in-app preset) into the panel. */
export const setDialValues = (id: string, values: DialValuesPayload) => {
  if (!__DEV__) return;
  client?.send("setValues", { id, values });
};
