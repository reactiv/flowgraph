import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';
import { Background } from '../components/Background';

/**
 * Scene 1: The Problem (6s, frames 0-180)
 * "Building individual workflows doesn't scale"
 *
 * Shows fragmented tools: spreadsheets, sticky notes, disparate apps.
 * Visual: Chaotic, cluttered, frustrating. Red/amber tones.
 */
export function ProblemScene() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Headline animation
  const headlineProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const headlineOpacity = interpolate(headlineProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const headlineY = interpolate(headlineProgress, [0, 1], [30, 0]);

  // Subtle shake effect for chaos feeling
  const shakeX = Math.sin(frame * 0.3) * 2;
  const shakeY = Math.cos(frame * 0.25) * 1.5;

  // Fragmented tool mockups
  const tools = [
    {
      name: 'Lab Tracker.xlsx',
      type: 'spreadsheet',
      color: colors.emerald,
      x: 120,
      y: 280,
      rotation: -5,
      delay: 0.3,
    },
    {
      name: 'Equipment Log',
      type: 'paper',
      color: colors.amber,
      x: 480,
      y: 220,
      rotation: 8,
      delay: 0.5,
    },
    {
      name: 'QC Dashboard v2',
      type: 'legacy',
      color: colors.red,
      x: 900,
      y: 300,
      rotation: -3,
      delay: 0.7,
    },
    {
      name: 'Sample Notes',
      type: 'sticky',
      color: colors.warning,
      x: 350,
      y: 480,
      rotation: 12,
      delay: 0.9,
    },
    {
      name: 'Maintenance.doc',
      type: 'doc',
      color: colors.blue,
      x: 720,
      y: 520,
      rotation: -8,
      delay: 1.1,
    },
    {
      name: 'Email Thread',
      type: 'email',
      color: colors.violet,
      x: 1100,
      y: 450,
      rotation: 5,
      delay: 1.3,
    },
  ];

  return (
    <AbsoluteFill>
      <Background variant="dark" glowColor={colors.destructive} glowIntensity={0.15} />

      {/* Headline */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 56,
            fontWeight: 700,
            color: colors.foreground,
            margin: 0,
            letterSpacing: -1,
          }}
        >
          Building individual workflows{' '}
          <span style={{ color: colors.destructive }}>doesn't scale</span>
        </h1>
      </div>

      {/* Chaotic tools */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${shakeX}px, ${shakeY}px)`,
        }}
      >
        {tools.map((tool, i) => (
          <ToolMockup
            key={i}
            {...tool}
            frame={frame}
            fps={fps}
            totalFrames={durationInFrames}
          />
        ))}

        {/* Connecting lines showing disconnection */}
        <DisconnectedLines frame={frame} fps={fps} />
      </div>

      {/* Red warning indicators */}
      <Sequence from={Math.floor(fps * 2)} premountFor={Math.floor(fps * 0.5)}>
        <WarningIndicators frame={frame - fps * 2} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
}

interface ToolMockupProps {
  name: string;
  type: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  delay: number;
  frame: number;
  fps: number;
  totalFrames: number;
}

function ToolMockup({
  name,
  type,
  color,
  x,
  y,
  rotation,
  delay,
  frame,
  fps,
}: ToolMockupProps) {
  const progress = spring({
    frame: frame - delay * fps,
    fps,
    config: springConfigs.bouncy,
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Different mockup styles based on type
  const getContent = () => {
    switch (type) {
      case 'spreadsheet':
        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 2,
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 36,
                  height: 16,
                  backgroundColor: i < 4 ? colors.muted : colors.input,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        );
      case 'paper':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[true, true, false, true, false].map((checked, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: `2px solid ${colors.mutedForeground}`,
                    borderRadius: 3,
                    backgroundColor: checked ? colors.mutedForeground : 'transparent',
                  }}
                />
                <div
                  style={{
                    width: 80 + (i * 17) % 40,
                    height: 8,
                    backgroundColor: colors.muted,
                    borderRadius: 2,
                  }}
                />
              </div>
            ))}
          </div>
        );
      case 'legacy':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                gap: 8,
              }}
            >
              {[colors.destructive, colors.warning, colors.success].map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: 40,
                    height: 40,
                    backgroundColor: `${c}30`,
                    border: `2px solid ${c}`,
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                height: 6,
                backgroundColor: colors.destructive,
                borderRadius: 3,
                width: '60%',
              }}
            />
          </div>
        );
      case 'sticky':
        return (
          <div
            style={{
              fontFamily: fonts.body,
              fontSize: 11,
              color: colors.background,
              lineHeight: 1.4,
            }}
          >
            TODO: Check sample
            <br />
            - Call vendor
            <br />
            - Update log??
          </div>
        );
      default:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 100 + (i * 23) % 50,
                  height: 8,
                  backgroundColor: colors.muted,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        );
    }
  };

  const bgColor = type === 'sticky' ? color : colors.card;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        opacity,
        transformOrigin: 'center center',
      }}
    >
      <div
        style={{
          backgroundColor: bgColor,
          borderRadius: type === 'sticky' ? 4 : 12,
          padding: 16,
          border: type === 'sticky' ? 'none' : `1px solid ${colors.border}`,
          boxShadow:
            type === 'sticky'
              ? '4px 4px 12px rgba(0,0,0,0.3)'
              : `0 8px 32px rgba(0,0,0,0.4)`,
          minWidth: 160,
        }}
      >
        {type !== 'sticky' && (
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: color,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: color,
              }}
            />
            {name}
          </div>
        )}
        {getContent()}
      </div>
    </div>
  );
}

function DisconnectedLines({ frame, fps }: { frame: number; fps: number }) {
  const lines = [
    { x1: 280, y1: 350, x2: 480, y2: 300, delay: 1.5 },
    { x1: 640, y1: 320, x2: 900, y2: 380, delay: 1.7 },
    { x1: 450, y1: 550, x2: 720, y2: 580, delay: 1.9 },
  ];

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {lines.map((line, i) => {
        const progress = spring({
          frame: frame - line.delay * fps,
          fps,
          config: springConfigs.smooth,
        });

        const dashOffset = interpolate(progress, [0, 1], [100, 0]);
        const opacity = interpolate(progress, [0, 0.5], [0, 0.4], {
          extrapolateRight: 'clamp',
        });

        return (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={colors.destructive}
            strokeWidth={2}
            strokeDasharray="8 8"
            strokeDashoffset={dashOffset}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function WarningIndicators({ frame, fps }: { frame: number; fps: number }) {
  const indicators = [
    { x: 200, y: 400, label: 'Out of sync' },
    { x: 600, y: 280, label: 'Duplicate data' },
    { x: 1000, y: 480, label: 'Version conflict' },
  ];

  return (
    <>
      {indicators.map((ind, i) => {
        const progress = spring({
          frame: frame - i * 0.15 * fps,
          fps,
          config: springConfigs.snappy,
        });

        const scale = interpolate(progress, [0, 1], [0, 1]);
        const opacity = interpolate(progress, [0, 0.5], [0, 1], {
          extrapolateRight: 'clamp',
        });

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: ind.x,
              top: ind.y,
              transform: `scale(${scale})`,
              opacity,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: `${colors.destructive}20`,
                border: `1px solid ${colors.destructive}`,
                borderRadius: 20,
                padding: '6px 12px',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.destructive}
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: 12,
                  fontWeight: 500,
                  color: colors.destructive,
                }}
              >
                {ind.label}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
