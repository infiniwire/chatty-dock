import { useState } from 'react';
import type { Snapshot } from '../../shared/model';
import type { RunCommand } from './profiles';

export function SignInDiagnostics({
  state,
  run,
}: {
  state: Snapshot;
  run: RunCommand;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const trace = state.signInTrace;
  return (
    <section className="sign-in-diagnostics" aria-labelledby="sign-in-diagnostics-heading">
      <h2 id="sign-in-diagnostics-heading">Sign-in troubleshooting</h2>
      <p className="hint">
        Record this window’s navigation domains to diagnose unexpected browser redirects. Recording
        stays in memory and excludes URL paths, query parameters, passwords and page contents.
      </p>
      <div className="actions">
        <button
          className="action-button"
          onClick={async () => {
            setCopied(false);
            const result = await run({
              type: 'sign-in-trace',
              action: trace?.recording ? 'stop' : 'start',
            });
            if (result.ok && !trace?.recording) await run({ type: 'panel', panel: 'none' });
          }}
        >
          {trace?.recording ? 'Stop recording' : 'Start recording'}
        </button>
        <button
          className="action-button"
          disabled={!trace?.count}
          onClick={async () => {
            const result = await run({ type: 'sign-in-trace', action: 'copy' });
            if (result.ok) setCopied(true);
          }}
        >
          Copy sign-in report
        </button>
        <button
          className="text-button"
          disabled={!trace?.count}
          onClick={async () => {
            setCopied(false);
            await run({ type: 'sign-in-trace', action: 'clear' });
          }}
        >
          Clear report
        </button>
      </div>
      <p className="hint" role="status">
        {copied
          ? 'Report copied.'
          : `${trace?.recording ? 'Recording' : 'Not recording'} · ${trace?.count ?? 0} events. Start recording, retry sign-in, then return here to copy the report. Nothing is sent automatically.`}
      </p>
    </section>
  );
}
