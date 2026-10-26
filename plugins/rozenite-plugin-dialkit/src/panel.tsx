/**
 * DialsPanel — DialKit rendered inside React Native DevTools.
 *
 * FLOW:
 *   client connects ─► send ready ─► app replies with one register per live dial set
 *   register ─► DialBridge mounts useDialKitController(name, config, { id, persist })
 *   any control change ─► values (one message per animation frame per id) ─► app store
 *   action control ─► action ─► app onAction handler
 *   setValues from app ─► controller.setValues (in-app edits stay in sync)
 *
 * KEY FEATURES:
 * - Real DialKit UI: sliders, XY pads, spring/easing editors, colors, versions, Copy
 * - persist: values and versions survive panel reloads (localStorage `dialkit:<id>`)
 * - App reload re-registers with a new revision; the panel answers with its values,
 *   so the app resumes at the tuned state instead of the code defaults
 * - productionEnabled: Rozenite builds panels in production mode, where DialRoot
 *   would otherwise hide itself
 */
import { useRozeniteDevToolsClient, type RozeniteDevToolsClient } from "@rozenite/plugin-bridge";
import { DialRoot, useDialKitController, type DialKitValueUpdates } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef, useState } from "react";
import { PLUGIN_ID, type DialEvents, type DialRegistration } from "./protocol";

// ============================================================================
// Types
// ============================================================================

type Client = RozeniteDevToolsClient<DialEvents>;

type DialBridgeProps = {
  client: Client;
  registration: DialRegistration;
};

// ============================================================================
// Bridge (one per registered id)
// ============================================================================

const DialBridge = ({ client, registration }: DialBridgeProps) => {
  const { id, name, config, revision } = registration;
  const dial = useDialKitController(name, config, {
    id,
    persist: true,
    onAction: (path) => client.send("action", { id, path }),
  });
  const { values } = dial;

  // Coalesce slider drags to one message per frame.
  const frame = useRef<number | null>(null);
  const latest = useRef(values);
  latest.current = values;

  useEffect(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      client.send("values", { id, values: latest.current });
    });
  }, [client, id, values, revision]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  useEffect(() => {
    const sub = client.onMessage("setValues", (message) => {
      if (message.id !== id) return;
      dial.setValues(message.values as DialKitValueUpdates<typeof config>);
    });
    return () => sub.remove();
  }, [client, id, dial]);

  return null;
};

// ============================================================================
// Panel
// ============================================================================

export default function DialsPanel() {
  const client = useRozeniteDevToolsClient<DialEvents>({ pluginId: PLUGIN_ID });
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, DialRegistration>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!client) return;
    const subs = [
      client.onMessage("register", (registration) => {
        setRegistrations((prev) => new Map(prev).set(registration.id, registration));
      }),
      client.onMessage("unregister", ({ id }) => {
        setRegistrations((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }),
    ];
    client.send("ready", { at: Date.now() });
    return () => subs.forEach((sub) => sub.remove());
  }, [client]);

  return (
    <div style={styles.host}>
      {client &&
        [...registrations.values()].map((registration) => (
          <DialBridge key={registration.id} client={client} registration={registration} />
        ))}
      {registrations.size === 0 ? (
        <p style={styles.empty}>
          {client ? "No dials registered. Open a screen that calls useDials." : "Connecting to the app…"}
        </p>
      ) : (
        <DialRoot mode="inline" theme="dark" defaultOpen productionEnabled />
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  host: {
    minHeight: "100vh",
    background: "#1a1a1a",
    color: "#fff",
    padding: 16,
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
  },
  empty: { opacity: 0.6, fontSize: 13, margin: 0 },
} satisfies Record<string, React.CSSProperties>;
