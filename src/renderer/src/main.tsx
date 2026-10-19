import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Command, Diagnostic, DockBridge, Snapshot, Panel, Profile } from '../../shared/model';
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
function bytes(value: number): string {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(0)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function App(): React.JSX.Element {
  const [state, setState] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState<string>();
  const [updateToken, setUpdateToken] = useState('');
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
  async function send(command: Command): Promise<unknown> {
    setError('');
    const result = await window.dock.command(command);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    return result.value;
  }
  const panel = (value: Panel): void => {
    setError('');
    setName('');
    setEditing(undefined);
    void send({ type: 'panel', panel: value });
  };
  if (!state) return <main className="startup">Starting ChattyDock…</main>;
  const profile = state.settings.profiles.find((p) => p.id === state.profileId)!;
  const active = state.downloads.filter((d) => d.active).length;
  async function create(open: boolean): Promise<void> {
    const created = (await send({ type: 'profile-create', name })) as Profile | undefined;
    if (!created) return;
    setName('');
    if (open) {
      await send({ type: 'new-window', profileId: created.id });
      panel('none');
    }
  }
  return (
    <>
      <header className="chrome">
        <div className="topbar">
          <div className="nav" aria-label="Website navigation">
            <button
              title="Back"
              aria-label="Back"
              disabled={!state.canGoBack}
              onClick={() => void send({ type: 'navigate', action: 'back' })}
            >
              ←
            </button>
            <button
              title="Forward"
              aria-label="Forward"
              disabled={!state.canGoForward}
              onClick={() => void send({ type: 'navigate', action: 'forward' })}
            >
              →
            </button>
            <button
              title="Reload website"
              aria-label="Reload website"
              onClick={() => void send({ type: 'navigate', action: 'reload' })}
            >
              ↻
            </button>
            <button title="Home" onClick={() => void send({ type: 'navigate', action: 'home' })}>
              Home
            </button>
          </div>
          <div className="spacer" />
          <select
            aria-label="Active login profile"
            value={state.profileId}
            onChange={(event) => void send({ type: 'profile-switch', id: event.target.value })}
          >
            {state.settings.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => panel('new')}>
            ＋ New window
          </button>
          <button title="Downloads" onClick={() => panel('downloads')}>
            ↓ {active > 0 ? active : 'Downloads'}
          </button>
          <button title="Settings" onClick={() => panel('settings')}>
            ⚙
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
          <section className="panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">YOUR DESKTOP WORKSPACE</div>
                <h1>{labels[state.panel]}</h1>
              </div>
              <button
                className="panel-close"
                aria-label="Back to chat"
                title="Back to chat"
                onClick={() => panel('none')}
              >
                ×
              </button>
            </div>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {state.panel === 'new' && (
              <>
                <p className="intro">Another conversation. Your choice of account.</p>
                <div className="card">
                  <h2>Use current profile</h2>
                  <p>
                    Share the login for <strong>{profile.name}</strong> and open a separate
                    conversation.
                  </p>
                  <button
                    className="primary"
                    onClick={async () => {
                      await send({ type: 'new-window' });
                      panel('none');
                    }}
                  >
                    Open with {profile.name}
                  </button>
                </div>
                <div className="card">
                  <h2>Choose existing profile</h2>
                  <div className="row">
                    <select
                      aria-label="Profile for new window"
                      value={selected || state.profileId}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {state.settings.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        await send({ type: 'new-window', profileId: selected || state.profileId });
                        panel('none');
                      }}
                    >
                      Open window
                    </button>
                  </div>
                </div>
                <div className="card">
                  <h2>Create new profile</h2>
                  <p>Start with an isolated login. You can reuse it in future windows.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void create(true);
                    }}
                  >
                    <input
                      aria-label="New profile name"
                      placeholder="e.g. Work"
                      maxLength={48}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button>Create & open</button>
                  </form>
                </div>
              </>
            )}
            {state.panel === 'profiles' && (
              <>
                <p className="intro">Share a profile across windows, or keep accounts separate.</p>
                <p className="hint">
                  Signing out affects every window sharing that profile. Profiles logged into the
                  same account still share that account’s cloud history.
                </p>
                {state.settings.profiles.map((p) => (
                  <div className="card profile-row" key={p.id}>
                    <div>
                      <h2>
                        {p.name}{' '}
                        {p.id === state.settings.defaultProfileId && (
                          <span className="badge">Default</span>
                        )}
                      </h2>
                      <p>
                        {p.id === state.profileId ? 'Used by this window' : 'Saved login profile'}
                      </p>
                    </div>
                    <div className="row">
                      <button onClick={() => void send({ type: 'new-window', profileId: p.id })}>
                        Open
                      </button>
                      <button
                        onClick={() => {
                          setEditing(p.id);
                          setName(p.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        disabled={p.id === state.settings.defaultProfileId}
                        onClick={() => void send({ type: 'profile-default', id: p.id })}
                      >
                        Set default
                      </button>
                      <button
                        className="danger"
                        disabled={p.id === state.profileId || state.settings.profiles.length === 1}
                        onClick={() => void send({ type: 'profile-delete', id: p.id })}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                <div className="card">
                  <h2>{editing ? 'Rename profile' : 'Add profile'}</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (editing) {
                        await send({ type: 'profile-rename', id: editing, name });
                        setEditing(undefined);
                        setName('');
                      } else await create(false);
                    }}
                  >
                    <input
                      aria-label="Profile name"
                      required
                      maxLength={48}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Profile name"
                    />
                    <button className="primary">{editing ? 'Save name' : 'Create profile'}</button>
                  </form>
                  {editing && (
                    <button
                      onClick={() => {
                        setEditing(undefined);
                        setName('');
                      }}
                    >
                      Cancel rename
                    </button>
                  )}
                </div>
              </>
            )}
            {state.panel === 'downloads' && (
              <>
                <div className="row">
                  <p className="intro">Files stay on your computer.</p>
                  <span className="spacer" />
                  <button onClick={() => void send({ type: 'clear-downloads' })}>
                    Clear finished
                  </button>
                </div>
                {!state.downloads.length && (
                  <div className="empty">
                    <span className="empty-icon">↓</span>
                    <h2>No downloads yet</h2>
                    <p>Files downloaded from ChatGPT will appear here.</p>
                  </div>
                )}
                {state.downloads.map((d) => (
                  <div className="card" key={d.id}>
                    <div className="row">
                      <h2 className="filename">{d.filename}</h2>
                      <span className="spacer" />
                      <span className="badge">{d.state}</span>
                    </div>
                    <p>
                      {state.settings.profiles.find((p) => p.id === d.profileId)?.name ??
                        'Deleted profile'}{' '}
                      · {bytes(d.received)}
                      {d.total > 0 ? ` / ${bytes(d.total)}` : ' · Size unknown'}
                    </p>
                    {d.active && (
                      <progress
                        max={d.total || undefined}
                        value={d.total ? d.received : undefined}
                      />
                    )}
                    <div className="row">
                      {d.active && (
                        <>
                          <button
                            onClick={() =>
                              void send({ type: 'download', id: d.id, action: 'cancel' })
                            }
                          >
                            Cancel
                          </button>
                          {d.state === 'progressing' && (
                            <button
                              onClick={() =>
                                void send({ type: 'download', id: d.id, action: 'pause' })
                              }
                            >
                              Pause
                            </button>
                          )}
                          {(d.state === 'paused' || d.resumable) && (
                            <button
                              onClick={() =>
                                void send({ type: 'download', id: d.id, action: 'resume' })
                              }
                            >
                              Resume
                            </button>
                          )}
                        </>
                      )}
                      {d.state === 'completed' && (
                        <>
                          <button
                            onClick={() =>
                              void send({ type: 'download', id: d.id, action: 'open' })
                            }
                          >
                            Open file
                          </button>
                          <button
                            onClick={() =>
                              void send({ type: 'download', id: d.id, action: 'reveal' })
                            }
                          >
                            Show in folder
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <p className="hint">
                  Closing a window keeps downloads running. Quitting cancels active downloads.
                  Interrupted downloads cannot resume after restart.
                </p>
              </>
            )}
            {state.panel === 'settings' && (
              <>
                <div className="card">
                  <h2>Automatic updates</h2>
                  <p role="status">{state.update.message}</p>
                  <p className="hint">
                    On startup, download newer stable releases automatically, verify the download,
                    then install silently and restart. Active file downloads finish first. Save
                    unsent messages before restarting the app.
                  </p>
                  {state.update.stage === 'downloading' && (
                    <progress max={100} value={state.update.percent ?? 0} />
                  )}
                  <button
                    disabled={['checking', 'downloading', 'waiting', 'installing'].includes(
                      state.update.stage,
                    )}
                    onClick={() => void send({ type: 'updates' })}
                  >
                    Check for updates
                  </button>
                  <p className="hint">
                    Private repository access: {state.update.credentialSource ?? 'not configured'}.
                    GitHub CLI login and local GH_TOKEN are supported. A saved fine-grained token
                    needs read-only Contents access to this repository.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const token = updateToken;
                      setUpdateToken('');
                      await send({ type: 'update-token', token });
                    }}
                  >
                    <input
                      aria-label="GitHub update token"
                      type="password"
                      autoComplete="off"
                      placeholder="Repository-read token"
                      value={updateToken}
                      maxLength={512}
                      onChange={(e) => setUpdateToken(e.target.value)}
                      required
                    />
                    <button>Save encrypted token</button>
                  </form>
                  <button onClick={() => void send({ type: 'update-token', token: '' })}>
                    Remove saved token
                  </button>
                  <p className="hint">
                    Credentials stay in this computer’s OS-encrypted storage and are never included
                    in releases. Mac automatic installation requires a Developer ID signed build.
                  </p>
                </div>
                <div className="card">
                  <h2>Appearance</h2>
                  <label>
                    Theme
                    <select
                      value={state.settings.theme}
                      onChange={(e) =>
                        void send({
                          type: 'settings',
                          theme: e.target.value as 'system' | 'light' | 'dark',
                        })
                      }
                    >
                      <option value="system">Follow system</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                </div>
                <div className="card">
                  <h2>Downloads</h2>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={state.settings.askDownload}
                      onChange={(e) =>
                        void send({ type: 'settings', askDownload: e.target.checked })
                      }
                    />
                    Ask where to save each file
                  </label>
                  <p className="hint">
                    Automatic saves append a unique identifier to filenames to avoid collisions.
                  </p>
                  <div className="row">
                    <code className="path">{state.settings.downloadDirectory}</code>
                    <button onClick={() => void send({ type: 'directory' })}>Choose folder</button>
                  </div>
                </div>
                <div className="card">
                  <h2>Website zoom</h2>
                  <div className="row">
                    <button onClick={() => void send({ type: 'navigate', action: 'zoom-out' })}>
                      −
                    </button>
                    <span>{Math.round(state.settings.zoom * 100)}%</span>
                    <button onClick={() => void send({ type: 'navigate', action: 'zoom-in' })}>
                      ＋
                    </button>
                    <button onClick={() => void send({ type: 'navigate', action: 'zoom-reset' })}>
                      Reset
                    </button>
                  </div>
                </div>
                <div className="card">
                  <h2>Performance</h2>
                  <p>
                    The website controls conversation rendering. A desktop wrapper cannot guarantee
                    smooth performance for very long conversations.
                  </p>
                  <button onClick={() => panel('diagnostics')}>Open diagnostics</button>
                </div>
                <button onClick={() => panel('profiles')}>Manage login profiles</button>
              </>
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
                        <td>{bytes(d.workingSetKB * 1024)}</td>
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
              <div className="card about">
                <span className="mark large">D</span>
                <h2>ChattyDock</h2>
                <p>Version {state.version}</p>
                <p>
                  A focused desktop home for your conversations.
                  <br />
                  Multiple windows. Your choice of login.
                </p>
                <p className="hint">
                  An independent project, not affiliated with or endorsed by OpenAI. Your
                  conversations and attachments are handled by the ChatGPT website.
                </p>
                <button className="primary" onClick={() => void send({ type: 'updates' })}>
                  Check for updates
                </button>
              </div>
            )}
            {state.notice && <p className="hint">{state.notice}</p>}
          </section>
        </main>
      ) : state.error ? (
        <main className="workspace">
          <div className="empty">
            <span className="empty-icon">↻</span>
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
createRoot(document.getElementById('root')!).render(<App />);
