/**
 * AnimatedPortalCard
 * 
 * A card component that expands into a fullscreen portal with a 3D flip animation.
 * 
 * FLOW:
 * 1. User presses trigger card → measures position → opens portal
 * 2. Portal animates from trigger position → center of screen
 * 3. Card flips to reveal back content (3D Y-axis rotation)
 * 4. User taps backdrop → reverses animation → closes portal
 * 
 * KEY FEATURES:
 * - Smooth spring animations using Reanimated
 * - 3D flip effect with perspective
 * - Portal renders above all other content
 * - Supports render props for custom trigger handling
 */

import { SPRING_CONFIG, SPRING_CONFIG_FLIP } from "@/lib/animations/constants";
import { Portal } from "@gorhom/portal";
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Methods exposed to parent via ref
 * Usage: const cardRef = useRef<AnimatedPortalCardHandle>(null);
 *        cardRef.current?.open();
 */
export type AnimatedPortalCardHandle = {
  open: () => void;
  close: () => void;
  flip: () => void;
  isExpanded: boolean;
};

/**
 * Props passed to triggerContent when using render prop pattern
 * Allows child to control when expansion happens
 */
export type TriggerRenderProps = {
  onPress: () => void;
};

/**
 * Component props
 */
export type AnimatedPortalCardProps = {
  // --- Content ---
  // Can be ReactNode OR render function that receives { onPress }
  triggerContent: React.ReactNode | ((props: TriggerRenderProps) => React.ReactNode);
  frontContent: React.ReactNode;  // Shown initially when expanded
  backContent: React.ReactNode;   // Shown after flip

  // --- Styling ---
  triggerStyle?: StyleProp<ViewStyle>;
  expandedCardStyle?: StyleProp<ViewStyle>;

  // --- Size Configuration ---
  expandedWidthRatio?: number;  // 0.7 = 70% of screen width
  expandedHeightRatio?: number; // 0.7 = 70% of screen height

  // --- Callbacks ---
  onOpen?: () => void;
  onClose?: () => void;
  onFlip?: (isFront: boolean) => void;

  // --- Animation Configuration ---
  springConfig?: typeof SPRING_CONFIG;
  flipSpringConfig?: typeof SPRING_CONFIG_FLIP;

  // --- Behavior ---
  flipOnOpen?: boolean;          // Auto-flip to back when opening (default: true)
  closeOnBackdropPress?: boolean; // Close when tapping backdrop (default: true)
};

// ============================================================================
// COMPONENT
// ============================================================================

const AnimatedPortalCard = forwardRef<AnimatedPortalCardHandle, AnimatedPortalCardProps>(
  (
    {
      triggerContent,
      frontContent,
      backContent,
      triggerStyle,
      expandedCardStyle,
      expandedWidthRatio = 0.7,
      expandedHeightRatio = 0.7,
      onOpen,
      onClose,
      onFlip,
      springConfig = SPRING_CONFIG,
      flipSpringConfig = SPRING_CONFIG_FLIP,
      flipOnOpen = true,
      closeOnBackdropPress = true,
    },
    ref
  ) => {
    // Screen dimensions for calculating center position
    const { width, height } = useWindowDimensions();
    
    // Controls portal visibility (React state for mounting/unmounting)
    const [isExpanded, setIsExpanded] = useState(false);

    // ========================================================================
    // REFS & SHARED VALUES
    // ========================================================================

    // Ref to measure trigger card's position on screen
    const cardRef = useRef<View>(null);

    // Origin position/size - captured when opening, used for animation start point
    const originX = useSharedValue(0);
    const originY = useSharedValue(0);
    const originWidth = useSharedValue(160);
    const originHeight = useSharedValue(225);

    // Target dimensions (center of screen)
    const targetWidth = width * expandedWidthRatio;
    const targetHeight = height * expandedHeightRatio;

    // Animation progress: 0 = collapsed (at trigger), 1 = expanded (at center)
    const animationProgress = useSharedValue(0);

    // Flip progress: 0 = front face visible, 1 = back face visible
    const flipProgress = useSharedValue(0);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    /**
     * Opens the card:
     * 1. Measures trigger position on screen
     * 2. Stores origin coordinates in shared values
     * 3. Mounts portal (setIsExpanded)
     * 4. Animates to expanded state
     * 5. Optionally flips to back content
     */
    const open = () => {
      cardRef.current?.measureInWindow((x, y, w, h) => {
        // Store measured position for animation start point
        originX.value = x;
        originY.value = y;
        originWidth.value = w;
        originHeight.value = h;

        // Mount portal and start expand animation
        setIsExpanded(true);
        animationProgress.value = withSpring(1, springConfig);

        // Auto-flip to back content if enabled
        if (flipOnOpen) {
          flipProgress.value = withSpring(1, springConfig);
        }

        onOpen?.();
      });
    };

    /**
     * Closes the card:
     * 1. Animates back to origin position
     * 2. Flips back to front face
     * 3. Waits for animation to complete
     * 4. Unmounts portal
     */
    const close = () => {
      // Start close animations
      animationProgress.value = withSpring(0, springConfig);
      flipProgress.value = withSpring(0, springConfig);

      // Delay portal unmount until animation completes
      // This prevents the portal from disappearing mid-animation
      const duration = springConfig.duration || 1500;
      setTimeout(() => {
        setIsExpanded(false);
        onClose?.();
      }, duration);
    };

    /**
     * Toggles between front and back face
     */
    const flip = () => {
      const newValue = flipProgress.value === 0 ? 1 : 0;
      flipProgress.value = withSpring(newValue, flipSpringConfig);
      onFlip?.(newValue === 0); // true if now showing front
    };

    /**
     * Internal handler for trigger press
     * Only opens if not already expanded
     */
    const handleTriggerPress = () => {
      if (!isExpanded) {
        open();
      }
    };

    /**
     * Handler for backdrop press
     * Closes card if closeOnBackdropPress is enabled
     */
    const handleBackdropPress = () => {
      if (closeOnBackdropPress && isExpanded) {
        close();
      }
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      open,
      close,
      flip,
      isExpanded,
    }));

    // ========================================================================
    // ANIMATED STYLES
    // ========================================================================

    /**
     * Trigger card opacity animation
     * - On OPEN: Fades out immediately (0 → 0.005 progress)
     * - On CLOSE: Stays hidden until very end, then fades in
     * This creates seamless transition where portal appears to "take over"
     */
    const triggerAnimatedStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        animationProgress.value,
        [0, 0.005, 0.1, 1],  // Fade in only at very end of close animation
        [1, 0, 0, 0],
        "clamp"
      ),
    }));

    /**
     * Backdrop opacity animation
     * Fades in quickly at start, maintains 0.5 opacity when expanded
     */
    const backdropAnimatedStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        animationProgress.value,
        [0, 0.05, 1],
        [0, 0.5, 0.5],
        "clamp"
      ),
    }));

    /**
     * Expanded card position and size animation
     * Interpolates from trigger position/size to center of screen
     */
    const expandedAnimatedStyle = useAnimatedStyle(() => {
      // Calculate center position
      const targetX = (width - targetWidth) / 2;
      const targetY = (height - targetHeight) / 2;

      return {
        position: "absolute",
        // Animate from trigger position to center
        left: interpolate(
          animationProgress.value,
          [0, 1],
          [originX.value, targetX]
        ),
        top: interpolate(
          animationProgress.value,
          [0, 1],
          [originY.value, targetY]
        ),
        // Animate from trigger size to expanded size
        width: interpolate(
          animationProgress.value,
          [0, 1],
          [originWidth.value, targetWidth]
        ),
        height: interpolate(
          animationProgress.value,
          [0, 1],
          [originHeight.value, targetHeight]
        ),
      };
    });

    /**
     * Front face 3D rotation
     * - Starts at 0° (visible)
     * - Rotates to 180° (hidden, backface not visible)
     * - Disables pointer events when rotated past 90°
     */
    const frontAnimatedStyle = useAnimatedStyle(() => {
      const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
      return {
        transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
        backfaceVisibility: "hidden",
        pointerEvents: flipProgress.value > 0.5 ? "none" : "auto",
      };
    });

    /**
     * Back face 3D rotation
     * - Starts at -180° (hidden, pre-rotated behind front)
     * - Rotates to 0° (visible)
     * - Enables pointer events when rotated past 90°
     */
    const backAnimatedStyle = useAnimatedStyle(() => {
      const rotateY = interpolate(flipProgress.value, [0, 1], [-180, 0]);
      return {
        transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
        backfaceVisibility: "hidden",
        pointerEvents: flipProgress.value <= 0.5 ? "none" : "auto",
      };
    });

    // ========================================================================
    // RENDER
    // ========================================================================

    // Resolve trigger content - supports both ReactNode and render prop
    const resolvedTriggerContent =
      typeof triggerContent === "function"
        ? triggerContent({ onPress: handleTriggerPress })
        : triggerContent;

    return (
      <>
        {/* 
          TRIGGER CARD
          - Stays in normal React tree (not in portal)
          - Fades out when portal opens
          - Used to measure origin position for animation
        */}
        <Animated.View
          ref={cardRef}
          style={[triggerStyle, triggerAnimatedStyle]}
          onTouchEnd={typeof triggerContent === "function" ? undefined : handleTriggerPress}
        >
          {resolvedTriggerContent}
        </Animated.View>

        {/* 
          PORTAL
          - Renders above all other content
          - Only mounted when isExpanded is true
        */}
        {isExpanded && (
          <Portal>
            {/* 
              BACKDROP
              - Fullscreen black overlay
              - Fades in/out with animation
              - Tap to close (if enabled)
            */}
            <Animated.View
              style={[styles.backdrop, backdropAnimatedStyle]}
              onTouchEnd={handleBackdropPress}
            />

            {/* 
              ANIMATED CONTAINER
              - Animates position and size
              - Contains both flip faces
            */}
            <Animated.View style={expandedAnimatedStyle}>
              {/* 
                FRONT FACE
                - Initially visible (rotateY: 0°)
                - Rotates away when flipping (rotateY: 180°)
              */}
              <Animated.View style={[styles.flipCard, frontAnimatedStyle, expandedCardStyle]}>
                {frontContent}
              </Animated.View>

              {/* 
                BACK FACE
                - Initially hidden (rotateY: -180°)
                - Rotates into view when flipping (rotateY: 0°)
              */}
              <Animated.View style={[styles.flipCard, backAnimatedStyle, expandedCardStyle]}>
                {backContent}
              </Animated.View>
            </Animated.View>
          </Portal>
        )}
      </>
    );
  }
);

AnimatedPortalCard.displayName = "AnimatedPortalCard";

export default AnimatedPortalCard;

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Fullscreen black backdrop
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "black",
  },
  // Base style for flip card faces (front & back)
  flipCard: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden", // Hide when rotated away
  },
});
