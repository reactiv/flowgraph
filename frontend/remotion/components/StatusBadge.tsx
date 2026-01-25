import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { getStatusColor } from '../lib/domains';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';

interface StatusBadgeProps {
  status: string;
  delay?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, delay = 0, size = 'md' }: StatusBadgeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const color = getStatusColor(status);

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springConfigs.snappy,
  });

  const scale = interpolate(progress, [0, 1], [0.5, 1]);
  const opacity = interpolate(progress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const sizes = {
    sm: { fontSize: 10, padding: '2px 6px' },
    md: { fontSize: 12, padding: '4px 10px' },
    lg: { fontSize: 14, padding: '6px 14px' },
  };

  const { fontSize, padding } = sizes[size];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: `${color}20`,
        border: `1px solid ${color}50`,
        borderRadius: 4,
        padding,
        fontFamily: fonts.body,
        fontSize,
        fontWeight: 500,
        color,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: color,
          marginRight: 6,
        }}
      />
      {status}
    </div>
  );
}
