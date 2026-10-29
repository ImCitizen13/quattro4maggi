/**
 * Color palettes shared between demos (hex strings, 4-5 colors each):
 * LIVE_BORDER_PALETTES (Live Border Card, Soap Film) and the named
 * BLACK_HOLE_PALETTES (Black Hole lens color pickers).
 */

/** The Live Border Card palettes, reused by the Soap Film color picker. */
export const LIVE_BORDER_PALETTES: readonly (readonly string[])[] = [
  ["#1E3163", "#2D46B9", "#F037A5", "#F8F8F8"],
  ["#372516", "#fbd271", "#0f4e77", "#89a377", "#E7bd8b"],
  ["#4285F4", "#DB4437", "#F4B400", "#0F9D58"],
  ["#0F2854", "#1C4D8D", "#4988C4", "#BDE8F5"],
  ["#000000", "#9929EA", "#FF5FCF", "#FAEB92"],
  ["#FF8F8F", "#FFF1CB", "#C2E2FA", "#B7A3E3"],
  ["#5409DA", "#4E71FF", "#8DD8FF", "#BBFBFF"],
];

/** A palette with a display name. */
export type NamedPalette = { name: string; colors: readonly string[] };

/** The Black Hole lens palettes (rim / halo / specular color pickers). */
export const BLACK_HOLE_PALETTES: readonly NamedPalette[] = [
  {
    name: "super-nova",
    colors: [
      "#FFFFFF", // Blinding Core / Exploding Star
      "#96F2F7", // Superheated Cyan Gas
      "#4F46E5", // Intense Cosmic Blue
      "#2E1065", // Deep Supernova Nebula
      "#0F172A", // Surrounding Void
    ],
  },
  {
    name: "event-horizon",
    colors: [
      "#000000", // The Singularity / Absolute Void
      "#1A1A2E", // Gravitational Redshift Shadow
      "#F59E0B", // Accretion Disk Friction (Amber)
      "#EF4444", // Extreme Heat Doppler-Shifted Red
      "#FFFFFF", // Pure Photonic Boundary
    ],
  },
  {
    name: "accretion-disk",
    colors: [
      "#0A0A16", // Background Vacuum
      "#311042", // Faint Quantum Glow / Hawking Radiation
      "#701A75", // Ionized Gas Field
      "#D946EF", // Energized Plasma Magnetosphere
      "#FDF4FF", // Core Accretion Luminosity
    ],
  },
];
