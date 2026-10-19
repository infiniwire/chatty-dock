import { useState } from 'react';
import {
  ArrowUpRight,
  CircleCheck,
  Download,
  Info,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { Snapshot, UpdateState } from '../../shared/model';
import type { RunCommand } from './profiles';

const labels: Record<UpdateState['stage'], string> = {
  idle: 'Ready to check',
  checking: 'Checking for updates',
  current: 'Up to date',
  downloading: 'Downloading an update',
  waiting: 'Ready to restart',
  installing: 'Installing update',
  error: 'Update needs attention',
  credentials: 'Repository access needed',
  unsupported: 'Manual update required',
  development: 'Development build',
};

function timestamp(value: number | string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AboutPanel({
  state,
  run,
  updateSettings,
}: {
  state: Snapshot;
  run: RunCommand;
  updateSettings: () => void;
}): React.JSX.Element {
  const [checking, setChecking] = useState(false);
  const busy =
    checking || ['checking', 'downloading', 'waiting', 'installing'].includes(state.update.stage);
  const StatusIcon =
    state.update.stage === 'current'
      ? CircleCheck
      : state.update.stage === 'error'
        ? TriangleAlert
        : state.update.stage === 'credentials'
          ? KeyRound
          : state.update.stage === 'downloading'
            ? Download
            : busy
              ? LoaderCircle
              : Info;
  const platform =
    state.platform === 'darwin' ? 'macOS' : state.platform === 'win32' ? 'Windows' : state.platform;
  return (
    <div className="about-content">
      <div className="about-identity">
        <img
          className="app-icon"
          src={new URL('../../../build/icon.png', import.meta.url).href}
          alt=""
          width={40}
          height={40}
        />
        <div>
          <h2>ChattyDock</h2>
          <p className="about-build">
            Version {state.version}
            <span aria-hidden="true"> · </span>
            {platform}
          </p>
        </div>
      </div>
      <section className="about-update" aria-labelledby="about-update-heading">
        <div className="about-update-row">
          <div className="about-update-summary">
            <div className="about-update-title">
              <StatusIcon
                className={StatusIcon === LoaderCircle ? 'update-spinning' : undefined}
                aria-hidden="true"
              />
              <h3 id="about-update-heading">{labels[state.update.stage]}</h3>
            </div>
            <p role="status">{state.update.message}</p>
            {state.update.version && (
              <p className="about-release-version">
                Release {state.update.version}
                {state.update.releaseDate && <span> · {timestamp(state.update.releaseDate)}</span>}
              </p>
            )}
            {state.update.stage === 'downloading' && (
              <div className="about-progress">
                <progress
                  aria-label="Update download progress"
                  max={100}
                  value={state.update.percent ?? 0}
                />
                <span>{Math.round(state.update.percent ?? 0)}%</span>
              </div>
            )}
          </div>
          <button
            className="action-button"
            disabled={busy}
            onClick={async () => {
              if (checking) return;
              setChecking(true);
              try {
                await run({ type: 'updates' });
              } finally {
                setChecking(false);
              }
            }}
          >
            <RefreshCw aria-hidden="true" />
            {checking || state.update.stage === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
        <div className="about-update-meta">
          {state.update.checkedAt && (
            <p className="about-checked">
              Last successful check: {timestamp(state.update.checkedAt)}
            </p>
          )}
          <button className="text-button" onClick={updateSettings}>
            Update settings
          </button>
        </div>
      </section>
      {state.update.releaseNotes && (
        <section className="about-release-notes" aria-labelledby="release-notes-heading">
          <h3 id="release-notes-heading">
            Release notes{state.update.version ? ` · ${state.update.version}` : ''}
          </h3>
          <p>{state.update.releaseNotes}</p>
        </section>
      )}
      <div className="about-links">
        <button
          className="about-link"
          onClick={() => void run({ type: 'project-page', page: 'releases' })}
        >
          Version history <ArrowUpRight aria-hidden="true" />
        </button>
        <button
          className="about-link"
          onClick={() => void run({ type: 'project-page', page: 'repository' })}
        >
          Project on GitHub <ArrowUpRight aria-hidden="true" />
        </button>
      </div>
      <p className="about-disclaimer">
        Independent app. Not affiliated with OpenAI. Private releases require GitHub access.
      </p>
    </div>
  );
}
