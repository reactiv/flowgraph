import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';

interface BackgroundProps {
  variant?: 'grid' | 'gradient' | 'dark';
  gridOpacity?: number;
  glowColor?: string;
  glowIntensity?: number;
}

export function Background({
  variant = 'grid',
  gridOpacity = 0.15,
  glowColor = colors.primary,
  glowIntensity = 0.2,
}: BackgroundProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle pulsing glow
  const pulse = interpolate(
    Math.sin((frame / fps) * Math.PI * 0.5),
    [-1, 1],
    [0.8, 1.2]
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
      }}
    >
      {/* Animated gradient background */}
      {(variant === 'gradient' || variant === 'grid') && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 50% 30%, ${glowColor}${Math.round(
              glowIntensity * pulse * 255
            )
              .toString(16)
              .padStart(2, '0')} 0%, transparent 60%)`,
          }}
        />
      )}

      {/* Grid pattern */}
      {variant === 'grid' && (
        <AbsoluteFill
          style={{
            backgroundImage: `
              linear-gradient(${colors.border}${Math.round(gridOpacity * 255)
              .toString(16)
              .padStart(2, '0')} 1px, transparent 1px),
              linear-gradient(90deg, ${colors.border}${Math.round(gridOpacity * 255)
              .toString(16)
              .padStart(2, '0')} 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />
      )}

      {/* Vignette effect */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, ${colors.background} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}
