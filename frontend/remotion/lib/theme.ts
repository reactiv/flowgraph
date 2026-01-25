/**
 * Hardcoded color constants for Remotion.
 * CSS variables don't work in Remotion, so we use hex values directly.
 */

export const colors = {
  // Backgrounds
  background: '#0d0e14',
  foreground: '#f8fafc',
  card: '#141520',
  muted: '#1e1f2a',
  mutedForeground: '#858a99',
  border: '#282937',
  input: '#1a1b24',

  // Brand colors
  primary: '#00d4ff',
  primaryForeground: '#0d0e14',
  secondary: '#f5b800',
  secondaryForeground: '#0d0e14',
  accent: '#17b877',
  accentForeground: '#0d0e14',
  destructive: '#e54545',
  destructiveForeground: '#f8fafc',

  // Status colors
  success: '#17b877',
  warning: '#f5b800',
  error: '#e54545',
  info: '#00d4ff',
  pending: '#858a99',
  active: '#8b5cf6',

  // Additional colors for variety
  cyan: '#00d4ff',
  amber: '#f5b800',
  emerald: '#17b877',
  red: '#e54545',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  orange: '#f97316',
  pink: '#ec4899',
  teal: '#14b8a6',
  indigo: '#6366f1',
} as const;

export const gradients = {
  cyanGlow: `radial-gradient(ellipse at center, ${colors.primary}20 0%, transparent 70%)`,
  amberGlow: `radial-gradient(ellipse at center, ${colors.secondary}20 0%, transparent 70%)`,
  cardGlow: `linear-gradient(135deg, ${colors.card} 0%, ${colors.muted} 100%)`,
} as const;

export const shadows = {
  glow: `0 0 40px ${colors.primary}30`,
  glowLg: `0 0 80px ${colors.primary}40`,
  card: `0 4px 24px rgba(0, 0, 0, 0.4)`,
} as const;
