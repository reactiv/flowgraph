import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springConfigs } from '../lib/animations';

interface NodeSparkleProps {
  delay?: number;
  size?: number;
  color?: string;
  x?: number;
  y?: number;
}

export function NodeSparkle({
  delay = 0,
  size = 120,
  color = colors.primary,
  x = 0,
  y = 0,
}: NodeSparkleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay * fps,
    fps,
    config: springConfigs.bouncy,
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0, 1, 1, 0.6]);

  // Sparkle particles
  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const particleProgress = spring({
      frame: frame - delay * fps - i * 2,
      fps,
      config: { damping: 15, stiffness: 100 },
    });
    const distance = interpolate(particleProgress, [0, 1], [0, size * 0.6]);
    const particleScale = interpolate(particleProgress, [0, 0.5, 1], [0, 1, 0]);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      scale: particleScale,
    };
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {/* Central glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          boxShadow: `0 0 ${size * 0.3}px ${color}80`,
        }}
      />

      {/* Sparkle particles */}
      {particles.map((particle, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: color,
            transform: `translate(calc(-50% + ${particle.x}px), calc(-50% + ${particle.y}px)) scale(${particle.scale})`,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      ))}
    </div>
  );
}
