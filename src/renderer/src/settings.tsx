import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Info,
  KeyRound,
  Minus,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Settings2,
  Sun,
} from 'lucide-react';
import type { Panel, Snapshot } from '../../shared/model';
import type { RunCommand } from './profiles';
import { AboutPanel } from './about';

const sections = [
  { id: 'appearance', label: 'Appearance', icon: Monitor },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'advanced', label: 'Advanced', icon: Settings2 },
  { id: 'about', label: 'About', icon: Info },
] as const;
export type SettingsSection = (typeof sections)[number]['id'];

export function SettingsPanel({
  state,
  run,
  panel,
  initialSection = 'appearance',
}: {
  state: Snapshot;
  run: RunCommand;
  panel: (value: Panel) => void;
  initialSection?: SettingsSection;
}): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [pendingAskDownload, setPendingAskDownload] = useState<boolean>();
  const busyRef = useRef(false);
  useEffect(() => {
    if (pendingAskDownload === state.settings.askDownload) setPendingAskDownload(undefined);
  }, [pendingAskDownload, state.settings.askDownload]);
  const perform: RunCommand = async (command) => {
    if (busyRef.current) return { ok: false, error: 'An action is already in progress.' };
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      return await run(command);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const updating = ['checking', 'downloading', 'waiting', 'installing'].includes(
    state.update.stage,
  );
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings categories">
        {sections.map((item) => (
          <button
            key={item.id}
            className={section === item.id ? 'current' : ''}
            aria-pressed={section === item.id}
            aria-controls="settings-content"
            onClick={() => {
              setSection(item.id);
              setMessage('');
              setToken('');
            }}
          >
            <item.icon aria-hidden="true" />
            {item.label}
          </button>
        ))}
        <span className="settings-version">ChattyDock {state.version}</span>
      </nav>
      <div className="settings-content" id="settings-content">
        {section === 'about' && (
          <AboutPanel state={state} run={run} updateSettings={() => setSection('updates')} />
        )}
        {section === 'appearance' && (
          <>
            <section className="settings-section" aria-labelledby="appearance-heading">
              <h2 id="appearance-heading">Appearance</h2>
              <p>Choose a look that feels comfortable.</p>
              <div className="theme-choices" role="group" aria-label="Theme">
                {(
                  [
                    { value: 'system', label: 'System', icon: Monitor },
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    aria-pressed={state.settings.theme === item.value}
                    disabled={busy}
                    onClick={() => void perform({ type: 'settings', theme: item.value })}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {state.settings.theme === item.value && (
                      <Check className="choice-check" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-section" aria-labelledby="zoom-heading">
              <div className="setting-row">
                <div>
                  <h2 id="zoom-heading">Website zoom</h2>
                  <p>The toolbar follows your chat text size.</p>
                </div>
                <div className="zoom-control" role="group" aria-label="Website zoom">
                  <button
                    className="icon-button"
                    aria-label="Zoom out"
                    title="Zoom out"
                    disabled={busy || state.settings.zoom <= 0.5}
                    onClick={() => void perform({ type: 'navigate', action: 'zoom-out' })}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <output aria-label="Current website zoom" aria-live="polite">
                    {Math.round(state.settings.zoom * 100)}%
                  </output>
                  <button
                    className="icon-button"
                    aria-label="Zoom in"
                    title="Zoom in"
                    disabled={busy || state.settings.zoom >= 2}
                    onClick={() => void perform({ type: 'navigate', action: 'zoom-in' })}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button
                className="text-button reset-zoom"
                disabled={busy || state.settings.zoom === 1}
                onClick={() => void perform({ type: 'navigate', action: 'zoom-reset' })}
              >
                Reset to 100%
              </button>
            </section>
          </>
        )}
        {section === 'downloads' && (
          <section className="settings-section" aria-labelledby="download-settings-heading">
            <h2 id="download-settings-heading">Downloads</h2>
            <p>Choose how and where files are saved.</p>
            <label className="setting-row toggle-setting" htmlFor="ask-download">
              <span>
                <strong>Ask where to save each file</strong>
                <span className="field-help">Choose a location before each download starts.</span>
              </span>
              <input
                id="ask-download"
                type="checkbox"
                role="switch"
                checked={pendingAskDownload ?? state.settings.askDownload}
                disabled={busy || pendingAskDownload !== undefined}
                onChange={async (event) => {
                  const askDownload = event.currentTarget.checked;
                  setPendingAskDownload(askDownload);
                  const result = await perform({ type: 'settings', askDownload });
                  if (!result.ok) setPendingAskDownload(undefined);
                }}
              />
            </label>
            <div className="folder-setting">
              <label htmlFor="download-folder">Default folder</label>
              <div className="folder-field">
                <FolderOpen aria-hidden="true" />
                <input
                  id="download-folder"
                  title={state.settings.downloadDirectory}
                  readOnly
                  value={state.settings.downloadDirectory}
                />
                <button disabled={busy} onClick={() => void perform({ type: 'directory' })}>
                  Change
                </button>
              </div>
              <p className="field-help">
                Automatic saves use unique filenames to keep existing files safe.
              </p>
            </div>
          </section>
        )}
        {section === 'updates' && (
          <section className="settings-section" aria-labelledby="updates-heading">
            <div className="setting-row">
              <div>
                <h2 id="updates-heading">Automatic updates</h2>
                <p>Version {state.version}</p>
              </div>
              <span className="badge">Stable channel</span>
            </div>
            <div className={`update-status update-${state.update.stage}`}>
              <RefreshCw className={updating ? 'update-spinning' : ''} aria-hidden="true" />
              <p role="status">{state.update.message}</p>
            </div>
            {state.update.stage === 'downloading' && (
              <progress
                aria-label="Application update download"
                max={100}
                value={state.update.percent ?? 0}
              />
            )}
            <button
              className="action-button"
              disabled={busy || updating}
              onClick={() => void perform({ type: 'updates' })}
            >
              <RefreshCw aria-hidden="true" />
              {state.update.stage === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
            <p className="field-help">
              New releases download at startup and install with a restart. Active file downloads
              finish first. Save unsent messages before restarting.
            </p>
            <details className="settings-disclosure">
              <summary>
                <KeyRound aria-hidden="true" /> Private repository access{' '}
                <ChevronDown className="disclosure-chevron" aria-hidden="true" />
              </summary>
              <div className="disclosure-content">
                <p>
                  Access: <strong>{state.update.credentialSource ?? 'not configured'}</strong>. Your
                  GitHub CLI login or local GH_TOKEN can provide access automatically.
                </p>
                <p className="field-help">
                  Alternatively, save a fine-grained token with read-only Contents access to this
                  repository. It is encrypted by your operating system.
                </p>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busyRef.current) return;
                    const response = await perform({ type: 'update-token', token });
                    if (response.ok) {
                      setToken('');
                      setMessage('Update access saved.');
                    }
                  }}
                >
                  <label className="sr-only" htmlFor="update-token">
                    GitHub update token
                  </label>
                  <input
                    id="update-token"
                    aria-label="GitHub update token"
                    type="password"
                    autoComplete="off"
                    placeholder="Repository-read token"
                    maxLength={512}
                    required
                    disabled={busy}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                  />
                  <button disabled={busy || !token.trim()}>Save token</button>
                </form>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if ((await perform({ type: 'update-token', token: '' })).ok) {
                      setToken('');
                      setMessage('Saved token removed.');
                    }
                  }}
                >
                  Remove saved token
                </button>
                <div className="saved-feedback" role="status">
                  {message && (
                    <>
                      <Check aria-hidden="true" />
                      {message}
                    </>
                  )}
                </div>
              </div>
            </details>
            {state.platform === 'darwin' && (
              <p className="field-help">
                Automatic installation on Mac requires a Developer ID signed build.
              </p>
            )}
          </section>
        )}
        {section === 'advanced' && (
          <>
            <section className="settings-section" aria-labelledby="workspace-settings-heading">
              <h2 id="workspace-settings-heading">Your workspace</h2>
              <div className="settings-link-row">
                <div>
                  <strong>Login profiles</strong>
                  <p>Reuse a login or keep accounts separate.</p>
                </div>
                <button className="action-button" onClick={() => panel('profiles')}>
                  Manage profiles <ArrowUpRight aria-hidden="true" />
                </button>
              </div>
            </section>
            <section className="settings-section" aria-labelledby="performance-heading">
              <h2 id="performance-heading">Diagnostics</h2>
              <p>
                Inspect memory and CPU usage, or record navigation domains to troubleshoot sign-in.
              </p>
              <button className="action-button" onClick={() => panel('diagnostics')}>
                <Activity aria-hidden="true" /> Open diagnostics
              </button>
            </section>
            <section className="settings-section" aria-labelledby="about-heading">
              <h2 id="about-heading">About ChattyDock</h2>
              <p>An independent desktop home for your conversations.</p>
              <button className="action-button" onClick={() => panel('about')}>
                <Info aria-hidden="true" /> About this app
              </button>
            </section>
          </>
        )}
        {section !== 'about' && (
          <p className="settings-saved">
            <Check aria-hidden="true" /> Preferences save automatically
          </p>
        )}
      </div>
    </div>
  );
}
