import { interpolate, spring, Easing } from 'remotion';

/**
 * Spring configurations for different animation feels.
 */
export const springConfigs = {
  /** Smooth, no bounce - for subtle reveals */
  smooth: { damping: 200 },
  /** Snappy, minimal bounce - for UI elements */
  snappy: { damping: 20, stiffness: 200 },
  /** Bouncy entrance - for playful animations */
  bouncy: { damping: 8 },
  /** Heavy, slow, small bounce - for weighty elements */
  heavy: { damping: 15, stiffness: 80, mass: 2 },
  /** Quick and responsive */
  quick: { damping: 30, stiffness: 300 },
} as const;

/**
 * Create a fade-in animation value.
 */
export function fadeIn(
  frame: number,
  fps: number,
  durationSeconds: number = 0.5,
  delaySeconds: number = 0
): number {
  const delayFrames = delaySeconds * fps;
  const durationFrames = durationSeconds * fps;
  return interpolate(frame - delayFrames, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/**
 * Create a fade-out animation value.
 */
export function fadeOut(
  frame: number,
  fps: number,
  totalDuration: number,
  durationSeconds: number = 0.5
): number {
  const startFrame = totalDuration - durationSeconds * fps;
  return interpolate(frame, [startFrame, totalDuration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/**
 * Create a slide-in animation from a direction.
 */
export function slideIn(
  frame: number,
  fps: number,
  direction: 'left' | 'right' | 'top' | 'bottom' = 'left',
  distance: number = 100,
  config = springConfigs.smooth
): { x: number; y: number } {
  const progress = spring({ frame, fps, config });

  const directions = {
    left: { x: interpolate(progress, [0, 1], [-distance, 0]), y: 0 },
    right: { x: interpolate(progress, [0, 1], [distance, 0]), y: 0 },
    top: { x: 0, y: interpolate(progress, [0, 1], [-distance, 0]) },
    bottom: { x: 0, y: interpolate(progress, [0, 1], [distance, 0]) },
  };

  return directions[direction];
}

/**
 * Create a scale animation.
 */
export function scaleIn(
  frame: number,
  fps: number,
  config = springConfigs.snappy
): number {
  return spring({ frame, fps, config });
}

/**
 * Create a staggered animation delay for list items.
 */
export function staggerDelay(index: number, staggerFrames: number = 5): number {
  return index * staggerFrames;
}

/**
 * Create an enter/exit animation pair.
 */
export function enterExit(
  frame: number,
  fps: number,
  totalDuration: number,
  enterDuration: number = 0.5,
  exitDuration: number = 0.5
): number {
  const enterFrames = enterDuration * fps;
  const exitStart = totalDuration - exitDuration * fps;

  if (frame < enterFrames) {
    return interpolate(frame, [0, enterFrames], [0, 1], {
      extrapolateRight: 'clamp',
    });
  }
  if (frame > exitStart) {
    return interpolate(frame, [exitStart, totalDuration], [1, 0], {
      extrapolateLeft: 'clamp',
    });
  }
  return 1;
}

/**
 * Create a pulsing glow effect.
 */
export function pulseGlow(frame: number, fps: number, speed: number = 2): number {
  const cycle = (frame / fps) * speed * Math.PI * 2;
  return 0.5 + 0.5 * Math.sin(cycle);
}

/**
 * Interpolate with easing for smoother motion.
 */
export function easedInterpolate(
  frame: number,
  inputRange: [number, number],
  outputRange: [number, number],
  easingFn = Easing.inOut(Easing.quad)
): number {
  return interpolate(frame, inputRange, outputRange, {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
