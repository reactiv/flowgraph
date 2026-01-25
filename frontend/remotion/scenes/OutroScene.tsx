import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
  Img,
} from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';
import { Background } from '../components/Background';

/**
 * Scene 7: Outro (5s, frames 1650-1800)
 * "Curie Omni"
 *
 * Logo reveal with tagline. Clean, confident ending.
 */

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Logo animation
  const logoProgress = spring({
    frame: frame - fps * 0.3,
    fps,
    config: springConfigs.smooth,
  });

  const logoScale = interpolate(logoProgress, [0, 1], [0.8, 1]);
  const logoOpacity = interpolate(logoProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Tagline animation
  const taglineProgress = spring({
    frame: frame - fps * 1,
    fps,
    config: springConfigs.smooth,
  });

  const taglineOpacity = interpolate(taglineProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const taglineY = interpolate(taglineProgress, [0, 1], [20, 0]);

  // Decorative rings animation
  const ringProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  return (
    <AbsoluteFill>
      <Background variant="gradient" glowColor={colors.primary} glowIntensity={0.3} />

      {/* Decorative animated rings */}
      <div
        style={{
          position: 'absolute',
          left: width / 2,
          top: height / 2 - 40,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {[1, 2, 3].map((ring, i) => {
          const ringDelay = i * 0.2;
          const progress = spring({
            frame: frame - ringDelay * fps,
            fps,
            config: springConfigs.smooth,
          });

          const scale = interpolate(progress, [0, 1], [0.5, 1 + i * 0.3]);
          const opacity = interpolate(progress, [0, 0.5, 1], [0, 0.3, 0.1]);

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) scale(${scale})`,
                width: 300 + i * 100,
                height: 300 + i * 100,
                borderRadius: '50%',
                border: `2px solid ${colors.primary}`,
                opacity,
              }}
            />
          );
        })}
      </div>

      {/* Main content */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            marginBottom: 32,
          }}
        >
          <CurieOmniLogo />
        </div>

        {/* Product name */}
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            fontWeight: 700,
            color: colors.foreground,
            margin: 0,
            marginBottom: 16,
            opacity: logoOpacity,
            letterSpacing: -2,
          }}
        >
          Curie{' '}
          <span
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Omni
          </span>
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: fonts.body,
            fontSize: 24,
            color: colors.mutedForeground,
            margin: 0,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          Universal Workflow Intelligence
        </p>

        {/* URL */}
        <div
          style={{
            marginTop: 48,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          <div
            style={{
              backgroundColor: `${colors.primary}15`,
              border: `1px solid ${colors.primary}30`,
              borderRadius: 8,
              padding: '12px 24px',
              fontFamily: fonts.mono,
              fontSize: 16,
              color: colors.primary,
            }}
          >
            curie.ai/omni
          </div>
        </div>
      </div>

      {/* Subtle particle effect */}
      <ParticleEffect frame={frame} fps={fps} />
    </AbsoluteFill>
  );
}

function CurieOmniLogo() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      {/* Outer ring */}
      <circle
        cx="60"
        cy="60"
        r="55"
        stroke={colors.primary}
        strokeWidth="2"
        opacity="0.3"
      />

      {/* Inner rings forming graph pattern */}
      <circle
        cx="60"
        cy="60"
        r="40"
        stroke={colors.primary}
        strokeWidth="2"
        opacity="0.5"
      />

      {/* Central node */}
      <circle cx="60" cy="60" r="12" fill={colors.primary} />

      {/* Orbital nodes */}
      {[0, 72, 144, 216, 288].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x = 60 + Math.cos(rad) * 40;
        const y = 60 + Math.sin(rad) * 40;

        return (
          <g key={i}>
            <line
              x1="60"
              y1="60"
              x2={x}
              y2={y}
              stroke={colors.primary}
              strokeWidth="2"
              opacity="0.6"
            />
            <circle
              cx={x}
              cy={y}
              r="8"
              fill={colors.card}
              stroke={colors.primary}
              strokeWidth="2"
            />
          </g>
        );
      })}
    </svg>
  );
}

function ParticleEffect({ frame, fps }: { frame: number; fps: number }) {
  // Generate floating particles
  const particles = Array.from({ length: 20 }, (_, i) => {
    const seed = i * 137.5; // Golden angle for distribution
    const baseX = (seed * 7) % 1920;
    const baseY = (seed * 11) % 1080;
    const speed = 0.5 + (i % 5) * 0.2;
    const size = 2 + (i % 3);

    // Floating animation
    const y = baseY + Math.sin((frame / fps + seed) * speed) * 30;
    const x = baseX + Math.cos((frame / fps + seed) * speed * 0.5) * 20;

    const opacity = 0.1 + Math.sin((frame / fps + seed) * 0.5) * 0.05;

    return { x, y, size, opacity };
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: colors.primary,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}
