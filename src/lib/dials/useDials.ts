/**
 * useDials — tune values live from the Dials panel in React Native DevTools.
 *
 * FLOW:
 *   hook mounts ─► retainDials(id, name, config) ─► panel renders DialKit controls
 *   panel drag ─► values message ─► one of:
 *     useDials          → React state (re-renders the caller)
 *     useDialsShared    → SharedValue<values> (no re-render, read in worklets)
 *     useDialsListener  → your callback (bind into SharedValues you already own)
 *
 * KEY FEATURES:
 * - Same config format as DialKit (`[default, min, max, step]`, folders, springs, pads…)
 * - Fully typed: values follow DialKit's `ResolvedValues<typeof config>`
 * - Production / Rozenite off: returns the config defaults and sends nothing
 * - Re-registers only when the config's JSON changes, not on every render
 */
import type { DialConfig, ResolvedValues } from "dialkit";
import { useEffect, useEffectEvent, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { resolveDialDefaults } from "./dialDefaults";
import {
  getDialValues,
  retainDials,
  subscribeDialActions,
  subscribeDialValues,
} from "./dialStore";

// ============================================================================
// Types
// ============================================================================

export type DialOptions = {
  /** Stable key for persistence and sharing across mounts. @default name */
  id?: string;
  /** Called with the full dot path when an `{ type: 'action' }` control is pressed. */
  onAction?: (path: string) => void;
};

export type DialValues<C extends DialConfig> = ResolvedValues<C>;

// ============================================================================
// Binding
// ============================================================================

const useDialBinding = <C extends DialConfig>(
  name: string,
  config: C,
  options: DialOptions | undefined,
  onValues: (values: DialValues<C>) => void,
) => {
  const id = options?.id ?? name;
  const configKey = JSON.stringify(config);
  const handleValues = useEffectEvent(onValues);
  const handleAction = useEffectEvent((path: string) => options?.onAction?.(path));

  useEffect(() => {
    const release = retainDials(id, name, JSON.parse(configKey) as DialConfig);
    const offValues = subscribeDialValues(id, (values) => handleValues(values as DialValues<C>));
    const offActions = subscribeDialActions(id, handleAction);
    const cached = getDialValues(id);
    if (cached) handleValues(cached as DialValues<C>);
    return () => {
      offValues();
      offActions();
      release();
    };
  }, [id, name, configKey]);

  return id;
};

const initialValues = <C extends DialConfig>(id: string, config: C): DialValues<C> =>
  (getDialValues(id) as DialValues<C> | undefined) ?? resolveDialDefaults(config);

// ============================================================================
// Hooks
// ============================================================================

/** Values as React state. Simple screens; re-renders on every panel change. */
export const useDials = <C extends DialConfig>(
  name: string,
  config: C,
  options?: DialOptions,
): DialValues<C> => {
  const [values, setValues] = useState(() => initialValues(options?.id ?? name, config));
  useDialBinding(name, config, options, setValues);
  return values;
};

/** Values in one SharedValue. Read `dials.value.x` in worklets; no re-renders. */
export const useDialsShared = <C extends DialConfig>(
  name: string,
  config: C,
  options?: DialOptions,
): SharedValue<DialValues<C>> => {
  const shared = useSharedValue(initialValues(options?.id ?? name, config));
  useDialBinding(name, config, options, (values) => shared.set(values));
  return shared;
};

/**
 * Callback on every panel change (and once on mount if values were already
 * tuned). For demos that already own SharedValues: write into them here.
 */
export const useDialsListener = <C extends DialConfig>(
  name: string,
  config: C,
  onChange: (values: DialValues<C>) => void,
  options?: DialOptions,
): void => {
  useDialBinding(name, config, options, onChange);
};
