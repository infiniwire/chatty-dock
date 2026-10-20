import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Download, House, Plus, RotateCw, Settings2, X } from 'lucide-react';
import type { Command, Diagnostic, DockBridge, Snapshot, Panel, Result } from '../../shared/model';
import { DownloadsPanel, formatBytes } from './downloads';
import { NewWindowPanel, ProfilesPanel, panelDescriptions } from './profiles';
import { SettingsPanel, type SettingsSection } from './settings';
import { AboutPanel } from './about';
import { ProfileSwitcher, ProfileMenuSurface } from './profile-dropdown';
import { WindowLayoutButton, WindowLayoutMenu } from './window-layout';
import './style.css';

declare global {
  interface Window {
    dock: DockBridge;
  }
}
const labels: Record<Panel, string> = {
  none: '',
  new: 'New window',
  profiles: 'Login profiles',
  downloads: 'Downloads',
  settings: 'Settings',
  about: 'About',
  diagnostics: 'Diagnostics',
};
function App(): React.JSX.Element {
  const [state, setState] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previousPanel = useRef<Panel>('none');
  useEffect(() => {
    const current = state?.panel ?? 'none';
    if (current !== 'none') {
      if (previousPanel.current === 'none')
        returnFocus.current = document.activeElement as HTMLElement;
      headingRef.current?.focus();
    } else if (previousPanel.current !== 'none' && returnFocus.current?.isConnected) {
      returnFocus.current.focus();
    }
    previousPanel.current = current;
    if (current === 'none') return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        panel('none');
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [state?.panel]);
  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'system';
  }, [state?.settings.theme]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--chat-font-size',
      `${state?.typography.fontSize ?? 16}px`,
    );
    document.documentElement.style.setProperty(
      '--toolbar-height',
      `${state?.typography.toolbarHeight ?? 55}px`,
    );
  }, [state?.typography.fontSize, state?.typography.toolbarHeight]);
  useEffect(() => {
    const unsubscribe = window.dock.subscribe(setState);
    void window.dock.command({ type: 'snapshot' });
    return unsubscribe;
  }, []);
  async function run(command: Command): Promise<Result> {
    setError('');
    try {
      const result = await window.dock.command(command);
      if (!result.ok) {
        if (result.error === 'Invalid command.' && command.type === 'layout-menu')
          result.error = 'Restart ChattyDock to use window layouts.';
        setError(result.error);
      }
      return result;
    } catch {
      const error = 'The action could not be completed. Please try again.';
      setError(error);
      return { ok: false, error };
    }
  }
  async function send(command: Command): Promise<unknown> {
    const result = await run(command);
    return result.ok ? result.value : undefined;
  }
  const panel = (value: Panel): void => {
    if (value === 'settings') setSettingsSection('appearance');
    void run({ type: 'panel', panel: value });
  };
  if (!state) return <main className="startup">Starting ChattyDock…</main>;
  const active = state.downloads.filter((download) => download.active).length;
  return (
    <>
      <header className="chrome">
        <div className="topbar">
          <nav
            className="nav"
            aria-label={state.panel === 'none' ? 'Website navigation' : 'Panel navigation'}
          >
            {state.panel === 'none' ? (
              <>
                <button
                  className="icon-button"
                  title="Back"
                  aria-label="Back"
                  disabled={!state.canGoBack}
                  onClick={() => void send({ type: 'navigate', action: 'back' })}
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  title="Forward"
                  aria-label="Forward"
                  disabled={!state.canGoForward}
                  onClick={() => void send({ type: 'navigate', action: 'forward' })}
                >
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  className={`icon-button${state.loading ? ' is-loading' : ''}`}
                  title="Reload website"
                  aria-label="Reload website"
                  onClick={() => void send({ type: 'navigate', action: 'reload' })}
                >
                  <RotateCw aria-hidden="true" />
                </button>
                <button
                  className="icon-button home-button"
                  title="Home"
                  aria-label="Home"
                  onClick={() => void send({ type: 'navigate', action: 'home' })}
                >
                  <House aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                className="icon-button"
                aria-label="Back to chat"
                title="Back to chat (Esc)"
                onClick={() => panel('none')}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </nav>
          <div className="spacer" />
          <ProfileSwitcher state={state} run={run} />
          <button
            className="primary new-window-button"
            aria-label="New window"
            title="New window"
            aria-expanded={state.panel === 'new'}
            aria-controls="workspace-panel"
            onClick={() => panel(state.panel === 'new' ? 'none' : 'new')}
          >
            <Plus aria-hidden="true" />
            <span>New window</span>
          </button>
          <button
            className={`downloads-button${state.panel === 'downloads' ? ' is-selected' : ''}`}
            title={active > 0 ? `Downloads · ${active} in progress` : 'Downloads'}
            aria-label="Downloads"
            aria-expanded={state.panel === 'downloads'}
            aria-controls="workspace-panel"
            onClick={() => panel(state.panel === 'downloads' ? 'none' : 'downloads')}
          >
            <Download aria-hidden="true" />
            <span className="toolbar-label">Downloads</span>
            {active > 0 && (
              <span
                className="download-count"
                role="status"
                aria-label={`${active} downloads in progress`}
              >
                {active}
              </span>
            )}
          </button>
          <WindowLayoutButton state={state} run={run} />
          <button
            className={`icon-button settings-button${state.panel === 'settings' ? ' is-selected' : ''}`}
            title="Settings"
            aria-label="Settings"
            aria-expanded={state.panel === 'settings'}
            aria-controls="workspace-panel"
            onClick={() => panel(state.panel === 'settings' ? 'none' : 'settings')}
          >
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </header>
      {error && state.panel === 'none' && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {state.panel !== 'none' ? (
        <main className="workspace">
          <section
            className={`panel panel-${state.panel}`}
            id="workspace-panel"
            aria-labelledby="panel-title"
          >
            <div className="panel-heading">
              <div>
                <h1 id="panel-title" ref={headingRef} tabIndex={-1}>
                  {labels[state.panel]}
                </h1>
                {panelDescriptions[state.panel] && (
                  <p className="panel-description">{panelDescriptions[state.panel]}</p>
                )}
              </div>
            </div>
            {error && (
              <div className="alert" role="alert" ref={errorRef} tabIndex={-1}>
                {error}
              </div>
            )}
            {state.panel === 'new' && (
              <NewWindowPanel
                state={state}
                run={run}
                close={() => panel('none')}
                manage={() => panel('profiles')}
              />
            )}
            {state.panel === 'profiles' && <ProfilesPanel state={state} run={run} />}
            {state.panel === 'downloads' && (
              <DownloadsPanel
                downloads={state.downloads}
                profiles={state.settings.profiles}
                send={send}
              />
            )}
            {state.panel === 'settings' && (
              <SettingsPanel
                state={state}
                run={run}
                panel={panel}
                initialSection={settingsSection}
              />
            )}
            {state.panel === 'diagnostics' && (
              <>
                <p className="intro">A snapshot of the application’s processes.</p>
                <p className="hint">
                  Each process is listed once. Browser and utility processes can serve multiple
                  windows. Working-set figures are not private memory and should not be summed as
                  exclusive physical memory.
                </p>
                <button
                  className="primary"
                  onClick={async () => {
                    const data = await send({ type: 'diagnostics' });
                    if (data) setDiagnostics(data as Diagnostic[]);
                  }}
                >
                  Capture snapshot
                </button>
                <table>
                  <thead>
                    <tr>
                      <th>Process</th>
                      <th>PID</th>
                      <th>CPU</th>
                      <th>Working set</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.map((d) => (
                      <tr key={d.pid}>
                        <td>{d.type}</td>
                        <td>{d.pid}</td>
                        <td>{d.cpu.toFixed(1)}%</td>
                        <td>{formatBytes(d.workingSetKB * 1024)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="hint">
                  Sampling is on demand. No background conversation scanning is performed.
                </p>
              </>
            )}
            {state.panel === 'about' && (
              <AboutPanel
                state={state}
                run={run}
                updateSettings={() => {
                  setSettingsSection('updates');
                  void run({ type: 'panel', panel: 'settings' });
                }}
              />
            )}
            {state.notice && <p className="hint">{state.notice}</p>}
          </section>
        </main>
      ) : state.error ? (
        <main className="workspace">
          <div className="empty">
            <span className="empty-icon">
              <RotateCw aria-hidden="true" />
            </span>
            <h1>Let’s reconnect</h1>
            <p>{state.error}</p>
            <button
              className="primary"
              onClick={() => void send({ type: 'navigate', action: 'reload' })}
            >
              Retry
            </button>
            <button onClick={() => panel('profiles')}>Check profiles</button>
          </div>
        </main>
      ) : null}
    </>
  );
}
const surface = new URL(location.href).searchParams.get('surface');
if (surface === 'profile-menu' || surface === 'layout-menu')
  document.documentElement.classList.add('profile-menu-surface');
createRoot(document.getElementById('root')!).render(
  surface === 'profile-menu' ? (
    <ProfileMenuSurface />
  ) : surface === 'layout-menu' ? (
    <WindowLayoutMenu />
  ) : (
    <App />
  ),
);
