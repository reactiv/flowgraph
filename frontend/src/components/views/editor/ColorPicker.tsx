'use client';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  disabled?: boolean;
}

// Common preset colors for status/category coloring
const PRESET_COLORS = [
  '#64748b', // slate
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
];

export function ColorPicker({ value, onChange, label, disabled }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <label className="text-sm font-medium text-gray-700 min-w-0 truncate">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        {/* Color input */}
        <div className="relative">
          <input
            type="color"
            value={value || '#64748b'}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-8 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {/* Hex value display */}
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            const hex = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
              onChange(hex);
            }
          }}
          placeholder="#000000"
          disabled={disabled}
          className="w-20 px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

interface ColorPickerWithPresetsProps extends ColorPickerProps {
  showPresets?: boolean;
}

export function ColorPickerWithPresets({
  value,
  onChange,
  label,
  disabled,
  showPresets = true,
}: ColorPickerWithPresetsProps) {
  return (
    <div className="space-y-2">
      <ColorPicker value={value} onChange={onChange} label={label} disabled={disabled} />
      {showPresets && (
        <div className="flex gap-1 flex-wrap">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={disabled}
              className={`w-5 h-5 rounded border-2 transition-all ${
                value === color ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
