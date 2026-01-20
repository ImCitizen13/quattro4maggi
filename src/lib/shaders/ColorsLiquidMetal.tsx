/**
 * Metal Color Presets for Liquid Metal Shader
 *
 * Provides predefined color combinations for different metal types.
 * Each metal has a highlight color (bright reflections) and shadow color (dark areas).
 *
 * USAGE:
 * ```tsx
 * import { METAL_PRESETS, getMetalColors } from '@/lib/shaders/ColorsLiquidMetal';
 *
 * // Option 1: Use preset directly
 * const { highlight, shadow } = METAL_PRESETS.gold;
 *
 * // Option 2: Use helper function
 * const colors = getMetalColors('gold');
 *
 * // Option 3: Custom colors
 * const colors = getMetalColors('custom', [1, 0.5, 0.8], [0.3, 0.1, 0.2]);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

/** RGB color as [R, G, B] with values 0-1 */
export type RGB = [number, number, number];

/** Available metal preset names */
export type MetalPresetName =
  | 'silver'
  | 'gold'
  | 'copper'
  | 'roseGold'
  | 'bronze'
  | 'platinum'
  | 'chrome'
  | 'titanium'
  | 'brass'
  | 'custom';

/** Metal color definition with highlight and shadow */
export type MetalColors = {
  highlight: RGB;
  shadow: RGB;
};

// ============================================================================
// METAL PRESETS
// ============================================================================

/**
 * Predefined metal color presets
 *
 * Each preset contains:
 * - highlight: Bright reflection color (light areas)
 * - shadow: Dark shadow color (dark areas)
 */
export const METAL_PRESETS: Record<Exclude<MetalPresetName, 'custom'>, MetalColors> = {
  /**
   * Silver - Classic metallic silver
   * Cool white highlights with neutral gray shadows
   */
  silver: {
    highlight: [0.98, 0.98, 1.0],
    shadow: [0.10, 0.10, 0.10],
  },

  /**
   * Gold - Warm yellow gold
   * Bright gold highlights with rich bronze shadows
   */
  gold: {
    highlight: [1.0, 0.84, 0.0],
    shadow: [0.40, 0.25, 0.0],
  },

  /**
   * Copper - Warm reddish-brown copper
   * Orange-tinted highlights with dark copper shadows
   */
  copper: {
    highlight: [0.72, 0.45, 0.20],
    shadow: [0.25, 0.12, 0.05],
  },

  /**
   * Rose Gold - Pink-tinted gold
   * Soft pink highlights with muted rose shadows
   */
  roseGold: {
    highlight: [0.98, 0.76, 0.70],
    shadow: [0.35, 0.15, 0.12],
  },

  /**
   * Bronze - Antique bronze finish
   * Warm orange-brown highlights with deep brown shadows
   */
  bronze: {
    highlight: [0.80, 0.50, 0.20],
    shadow: [0.30, 0.15, 0.05],
  },

  /**
   * Platinum - Cool silvery-white platinum
   * Slightly warm white highlights with cool gray shadows
   */
  platinum: {
    highlight: [0.90, 0.89, 0.88],
    shadow: [0.15, 0.15, 0.17],
  },

  /**
   * Chrome - High-contrast chrome finish
   * Pure white highlights with deep black shadows
   */
  chrome: {
    highlight: [1.0, 1.0, 1.0],
    shadow: [0.05, 0.05, 0.05],
  },

  /**
   * Titanium - Dark gunmetal titanium
   * Cool gray highlights with blue-tinted dark shadows
   */
  titanium: {
    highlight: [0.62, 0.62, 0.65],
    shadow: [0.12, 0.12, 0.15],
  },

  /**
   * Brass - Warm yellow brass
   * Bright yellow highlights with greenish-brown shadows
   */
  brass: {
    highlight: [0.95, 0.80, 0.30],
    shadow: [0.35, 0.28, 0.08],
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get metal colors by preset name or custom values
 *
 * @param preset - Metal preset name or 'custom' for custom colors
 * @param customHighlight - Custom highlight color (required if preset is 'custom')
 * @param customShadow - Custom shadow color (required if preset is 'custom')
 * @returns Metal colors with highlight and shadow
 *
 * @example
 * // Use preset
 * const goldColors = getMetalColors('gold');
 *
 * // Use custom colors
 * const customColors = getMetalColors('custom', [0.9, 0.5, 0.8], [0.3, 0.1, 0.2]);
 */
export function getMetalColors(
  preset: MetalPresetName,
  customHighlight?: RGB,
  customShadow?: RGB
): MetalColors {
  if (preset === 'custom') {
    if (!customHighlight || !customShadow) {
      console.warn('Custom metal preset requires customHighlight and customShadow. Falling back to silver.');
      return METAL_PRESETS.silver;
    }
    return {
      highlight: customHighlight,
      shadow: customShadow,
    };
  }

  return METAL_PRESETS[preset];
}

/**
 * Interpolate between two metal presets
 *
 * @param from - Starting metal preset
 * @param to - Ending metal preset
 * @param t - Interpolation value (0-1)
 * @returns Interpolated metal colors
 *
 * @example
 * // Blend 50% between silver and gold
 * const blendedColors = interpolateMetalColors('silver', 'gold', 0.5);
 */
export function interpolateMetalColors(
  from: Exclude<MetalPresetName, 'custom'>,
  to: Exclude<MetalPresetName, 'custom'>,
  t: number
): MetalColors {
  const fromColors = METAL_PRESETS[from];
  const toColors = METAL_PRESETS[to];

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return {
    highlight: [
      lerp(fromColors.highlight[0], toColors.highlight[0], t),
      lerp(fromColors.highlight[1], toColors.highlight[1], t),
      lerp(fromColors.highlight[2], toColors.highlight[2], t),
    ],
    shadow: [
      lerp(fromColors.shadow[0], toColors.shadow[0], t),
      lerp(fromColors.shadow[1], toColors.shadow[1], t),
      lerp(fromColors.shadow[2], toColors.shadow[2], t),
    ],
  };
}

/**
 * Get all available preset names
 * @returns Array of preset names (excluding 'custom')
 */
export function getMetalPresetNames(): Exclude<MetalPresetName, 'custom'>[] {
  return Object.keys(METAL_PRESETS) as Exclude<MetalPresetName, 'custom'>[];
}
