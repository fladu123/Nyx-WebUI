import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { preferencesApi } from './preferencesApi';

export default function SettingsPage() {
  const toast = useToast();
  const { darkMode, setDarkMode, accentTheme, setAccentTheme, accentThemes } = useTheme();

  const handleDarkModeChange = async (value) => {
    setDarkMode(value);
    try {
      await preferencesApi.updatePreferences({ dark_mode: value });
      toast('Settings saved', 'success');
    } catch (error) {
      toast('Failed to save settings', 'error');
    }
  };

  const handleAccentChange = async (themeId) => {
    setAccentTheme(themeId);
    try {
      await preferencesApi.updatePreferences({ accent_theme: themeId });
      toast('Settings saved', 'success');
    } catch (error) {
      toast('Failed to save settings', 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-desc">Customize your Nyx experience</div>
      </div>

      <div className="section">
        <div className="section-title">Appearance</div>

        <div className="toggle-row">
          <div>
            <div className="toggle-label">Dark mode</div>
            <div className="toggle-desc">Toggle light/dark theme</div>
          </div>
          <button
            className={`toggle ${darkMode ? 'on' : ''}`}
            onClick={() => handleDarkModeChange(!darkMode)}
            title="Toggle dark mode"
          />
        </div>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <div className="toggle-label">Accent color</div>
          <div className="toggle-desc" style={{ marginBottom: 10 }}>
            Choose your preferred accent color
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {accentThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleAccentChange(theme.id)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: theme.accent,
                  border: accentTheme === theme.id ? '2px solid var(--text-0)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                title={theme.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">About</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <p>
            <strong>Nyx</strong> — Your local AI workspace
          </p>
          <p>
            Built with React and Ollama. No data leaves your machine.
          </p>
        </div>
      </div>
    </div>
  );
}
