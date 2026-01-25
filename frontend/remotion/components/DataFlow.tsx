import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';

interface DataFlowProps {
  /** Start position */
  from: { x: number; y: number };
  /** End position */
  to: { x: number; y: number };
  /** Delay in seconds before animation starts */
  delay?: number;
  /** Duration in seconds */
  duration?: number;
  /** Color of the data particles */
  color?: string;
  /** Number of particles */
  particleCount?: number;
}

export function DataFlow({
  from,
  to,
  delay = 0,
  duration = 1,
  color = colors.primary,
  particleCount = 5,
}: DataFlowProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayFrames = delay * fps;
  const durationFrames = duration * fps;

  // Calculate path
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  // Create staggered particles
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const particleDelay = (i / particleCount) * 0.3; // Stagger particles
    const startFrame = delayFrames + particleDelay * fps;

    const progress = interpolate(
      frame - startFrame,
      [0, durationFrames],
      [0, 1],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );

    // Ease in-out for smooth motion
    const easedProgress =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const x = from.x + dx * easedProgress;
    const y = from.y + dy * easedProgress;

    // Particle size and opacity
    const opacity = interpolate(progress, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);
    const scale = interpolate(progress, [0, 0.5, 1], [0.5, 1, 0.5]);

    return { x, y, opacity, scale, progress };
  });

  // Trail line
  const trailProgress = interpolate(
    frame - delayFrames,
    [0, durationFrames * 0.8],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const trailLength = distance * trailProgress;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Trail line */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient
            id={`flow-gradient-${delay}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0} />
            <stop offset="50%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line
          x1={from.x}
          y1={from.y}
          x2={from.x + Math.cos(angle) * trailLength}
          y2={from.y + Math.sin(angle) * trailLength}
          stroke={`url(#flow-gradient-${delay})`}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>

      {/* Particles */}
      {particles.map(
        (particle, i) =>
          particle.progress > 0 &&
          particle.progress < 1 && (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: particle.x,
                top: particle.y,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: color,
                opacity: particle.opacity,
                transform: `translate(-50%, -50%) scale(${particle.scale})`,
                boxShadow: `0 0 12px ${color}, 0 0 24px ${color}50`,
              }}
            />
          )
      )}
    </div>
  );
}
