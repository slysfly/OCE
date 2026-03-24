import { useTheme, type ThemeMode } from '../store';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  const options: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: '亮色', icon: '☀️' },
    { value: 'dark', label: '暗色', icon: '🌙' },
    { value: 'system', label: '跟随系统', icon: '💻' },
  ];

  return (
    <div className="theme-switcher" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          className={`theme-btn ${theme === opt.value ? 'active' : ''}`}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: theme === opt.value ? 'var(--panel2)' : 'transparent',
            color: theme === opt.value ? 'var(--text)' : 'var(--muted)',
            cursor: 'pointer',
            transition: 'all .15s',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span style={{ fontSize: 12 }}>{opt.icon}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
