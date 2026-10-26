/**
 * Wire protocol between the DevTools panel (src/panel.tsx) and the app
 * (src/lib/dials/dialStore.ts). Types only: the app imports this file with
 * `import type`, so nothing here ever reaches the app bundle.
 *
 * FLOW:
 *   app mounts useDials ─► register { id, name, config, revision }
 *   panel mounts a DialKit controller per id ─► values { id, values } (rAF-throttled)
 *   panel opens / reloads ─► ready ─► app re-sends every live registration
 *   action control pressed ─► action { id, path }
 *   app pushes state (e.g. an in-app preset) ─► setValues { id, values }
 *   app unmounts the last user of an id ─► unregister { id }
 */
import type { DialConfig } from "dialkit";

/** Must equal the package `name`. */
export const PLUGIN_ID = "rozenite-plugin-dialkit";

export type DialRegistration = {
  /** Stable key: DialKit persistence and the app store both key on it. */
  id: string;
  /** Panel title. */
  name: string;
  config: DialConfig;
  /** Bumped on every send so the panel re-pushes values after an app reload. */
  revision: number;
};

/** A resolved DialKit values object (shape follows the config). */
export type DialValuesPayload = Record<string, unknown>;

export type DialEvents = {
  ready: { at: number };
  register: DialRegistration;
  unregister: { id: string };
  values: { id: string; values: DialValuesPayload };
  setValues: { id: string; values: DialValuesPayload };
  action: { id: string; path: string };
};
