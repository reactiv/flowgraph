import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { fonts } from '../lib/fonts';
import { colors } from '../lib/theme';

interface TypewriterTextProps {
  text: string;
  delay?: number;
  speed?: number; // characters per second
  showCursor?: boolean;
  style?: React.CSSProperties;
}

export function TypewriterText({
  text,
  delay = 0,
  speed = 40,
  showCursor = true,
  style,
}: TypewriterTextProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate visible characters
  const framesPerChar = fps / speed;
  const delayFrames = delay * fps;
  const charProgress = Math.max(0, (frame - delayFrames) / framesPerChar);
  const visibleChars = Math.min(Math.floor(charProgress), text.length);
  const displayText = text.slice(0, visibleChars);

  // Cursor blink
  const cursorVisible = showCursor && visibleChars < text.length;
  const cursorOpacity = cursorVisible
    ? interpolate(Math.sin((frame / fps) * Math.PI * 4), [-1, 1], [0.3, 1])
    : 0;

  return (
    <span
      style={{
        fontFamily: fonts.heading,
        color: colors.foreground,
        ...style,
      }}
    >
      {displayText}
      {cursorVisible && (
        <span
          style={{
            opacity: cursorOpacity,
            marginLeft: 2,
          }}
        >
          |
        </span>
      )}
    </span>
  );
}
