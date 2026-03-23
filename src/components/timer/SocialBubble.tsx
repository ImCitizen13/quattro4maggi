import {
  Group,
  Image as SkImage,
  Paint,
  RoundedRect,
  RuntimeShader,
  Text,
  useFont,
  useImage,
} from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import { useDerivedValue } from "react-native-reanimated";

import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";

const BUTTON_FONT_SIZE = 16;
const BUTTON_HEIGHT = 80;
const ICON_SIZE = 24;
const GAP = 10;
const BORDER_RADIUS = 40;

type SocialBubbleProps = {
  canvasWidth: number;
  canvasHeight: number;
  opacity: SharedValue<number>;
  pd: number;
  isDark: boolean;
};

export default function SocialBubble({
  canvasWidth,
  canvasHeight,
  opacity,
  pd,
  isDark,
}: SocialBubbleProps) {
  const font = useFont(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    BUTTON_FONT_SIZE
  );

  const xIcon = useImage(require("../../../assets/icons/x_icon.png"));

  if (!font) return null;

  // ── Layout measurements ────────────────────────────────────────────
  const followText = "Follow on";
  const handleText = "@m090009";
  const followWidth = font.measureText(followText).width;
  const handleWidth = font.measureText(handleText).width;

  // Total content width: text + gap + icon + gap + text
  const contentWidth = followWidth + GAP + ICON_SIZE + GAP + handleWidth;
  const buttonWidth = canvasWidth * 0.85;
  const buttonX = (canvasWidth - buttonWidth) / 2;
  const buttonY = canvasHeight * 0.9 - BUTTON_HEIGHT / 2;

  // Center content horizontally within the button
  const contentStartX = buttonX + (buttonWidth - contentWidth) / 2;
  const centerY = buttonY + BUTTON_HEIGHT / 2;

  // Text baseline (vertically centered)
  const textY = centerY + BUTTON_FONT_SIZE / 3;
  const followX = contentStartX;
  const iconX = followX + followWidth + GAP;
  const iconY = centerY - ICON_SIZE / 2;
  const handleX = iconX + ICON_SIZE + GAP;

  // ── BShader uniforms — transparent bg, low distortion ──────────────
  const bubbleCenterX = buttonX + buttonWidth / 2;
  const bubbleCenterY = buttonY + BUTTON_HEIGHT / 2;
  // Radius covers the pill shape (half the diagonal-ish)
  const bubbleRadius = Math.max(buttonWidth, BUTTON_HEIGHT) / 2;

  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [canvasWidth * pd, canvasHeight * pd],
    u_center: [bubbleCenterX * pd, bubbleCenterY * pd],
    u_radius: bubbleRadius * pd,
    u_refraction: 0.08,
    u_edgeWidth: 0.15,
    u_dispersion: 0.3,
    u_bgColor: [0, 0, 0],    // transparent-ish base
    u_specular: 0.4,
    u_shadowColor: isDark ? [1, 1, 1] : [0, 0, 0],
    u_shadowOpacity: 0.1,
    u_shadowSpread: 0.15,
    ...DEFAULT_PRISM_COLORS,
  }));

  return (
    <Group layer={<Paint opacity={opacity} />}>
      {/* BShader layer — applies refraction/prismatic to children */}
      <Group
        layer={
          <Paint>
            <RuntimeShader source={BShader} uniforms={shaderUniforms} />
          </Paint>
        }
      >
        {/* Black pill background */}
        <RoundedRect
          x={buttonX}
          y={buttonY}
          width={buttonWidth}
          height={BUTTON_HEIGHT}
          r={BORDER_RADIUS}
          color="black"
        />

        {/* "Follow on" */}
        <Text
          text={followText}
          font={font}
          x={followX}
          y={textY}
          color="white"
        />

        {/* X icon */}
        {xIcon && (
          <SkImage
            image={xIcon}
            x={iconX}
            y={iconY}
            width={ICON_SIZE}
            height={ICON_SIZE}
          />
        )}

        {/* "@m090009" */}
        <Text
          text={handleText}
          font={font}
          x={handleX}
          y={textY}
          color="white"
        />
      </Group>
    </Group>
  );
}
