import { cn } from '../../lib/cn';
import { useTheme, type ThemeMode } from '../../state/ThemeContext';
import { MonitorIcon, MoonIcon, SunIcon } from '../icons';

const MODES: Array<{ value: ThemeMode; label: string; Icon: typeof SunIcon }> = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

/**
 * A three-way segmented control rather than a cycling button: the current
 * choice is visible without clicking, and "System" stops being a hidden state.
 */
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'flex gap-0.5 rounded-lg border border-hairline bg-raised p-0.5',
        compact && 'hidden lg:flex'
      )}
    >
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          aria-label={label}
          title={label}
          onClick={() => setMode(value)}
          className={cn(
            'flex flex-1 items-center justify-center rounded-md py-1 transition',
            mode === value ? 'bg-surface text-ink shadow-card' : 'text-faint hover:text-ink'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
