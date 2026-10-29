import type { DialConfig, DialPadValue, DialValue, ResolvedValues } from "dialkit";

// ============================================================================
// Config → default values (mirrors DialKit's own resolution)
// ============================================================================

type Leaf = DialConfig[string];
/** Controls declared as `{ type: ... }` objects. */
type TypedControl = Exclude<DialValue, number | boolean | string | DialPadValue>;

const isTuple = (value: Leaf): value is [number, number, number, number?] =>
  Array.isArray(value) && typeof value[0] === "number";

const isTypedControl = (value: object): value is TypedControl =>
  "type" in value && typeof value.type === "string";

const optionValue = (option: string | { value: string } | undefined): string =>
  option === undefined ? "" : typeof option === "string" ? option : option.value;

const resolveLeaf = (value: Leaf): unknown => {
  if (isTuple(value)) return value[0];
  if (typeof value !== "object" || value === null) return value;
  if (!isTypedControl(value)) return resolveDialDefaults(value as DialConfig);
  switch (value.type) {
    case "select":
      return value.default ?? optionValue(value.options[0]);
    case "image":
      return value.default ?? optionValue(value.options?.[0]);
    case "color":
    case "text":
      return value.default ?? "";
    case "pad":
      return { x: value.x?.[0] ?? 0, y: value.y?.[0] ?? 0 };
    // spring / easing / action resolve to themselves
    default:
      return value;
  }
};

/**
 * What the panel would report before anyone touches a control: the app
 * renders these until the first `values` message, and forever in production.
 */
export const resolveDialDefaults = <C extends DialConfig>(config: C): ResolvedValues<C> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "_collapsed") continue;
    out[key] = resolveLeaf(value);
  }
  return out as ResolvedValues<C>;
};
