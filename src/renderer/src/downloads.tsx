import {
  Check,
  Download,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Info,
  Pause,
  Play,
  X,
} from 'lucide-react';
import type { Command, DownloadRecord, Profile } from '../../shared/model';

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${(value / 1024 ** unit).toFixed(unit === 1 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

const status: Record<DownloadRecord['state'], string> = {
  progressing: 'Downloading',
  paused: 'Paused',
  interrupted: 'Interrupted',
  completed: 'Saved',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

function FileIcon({ filename }: { filename: string }): React.JSX.Element {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const Icon = /^(png|jpe?g|gif|webp|svg|heic)$/.test(extension)
    ? FileImage
    : /^(zip|gz|tar|7z|rar)$/.test(extension)
      ? FileArchive
      : /^(pdf|txt|md|docx?|csv|xlsx?|json)$/.test(extension)
        ? FileText
        : File;
  return <Icon aria-hidden="true" />;
}

export function DownloadsPanel({
  downloads,
  profiles,
  send,
}: {
  downloads: DownloadRecord[];
  profiles: Profile[];
  send: (command: Command) => Promise<unknown>;
}): React.JSX.Element {
  const active = downloads.filter((download) => download.active).length;
  const finished = downloads.filter((download) => !download.active).length;
  return (
    <div className="downloads-panel">
      {downloads.length > 0 && (
        <div className="downloads-summary">
          <p>
            {downloads.length} {downloads.length === 1 ? 'file' : 'files'}
            {active > 0 && <span> · {active} in progress</span>}
          </p>
          <button
            className="text-button"
            disabled={finished === 0}
            title={
              finished
                ? 'Remove finished entries. Files stay on your computer.'
                : 'No finished downloads to clear'
            }
            onClick={() => void send({ type: 'clear-downloads' })}
          >
            Clear finished
          </button>
        </div>
      )}
      {downloads.length === 0 ? (
        <div className="downloads-empty">
          <div className="empty-symbol">
            <Download aria-hidden="true" />
          </div>
          <h2>Your downloads, all in one place</h2>
          <p>
            Download a file in ChatGPT and it will appear here.
            <br />
            Your files are saved on your computer.
          </p>
        </div>
      ) : (
        <ul className="download-list" aria-label="Downloaded files">
          {downloads.map((download) => {
            const percent =
              download.total > 0
                ? Math.min(100, Math.floor((download.received / download.total) * 100))
                : undefined;
            const action = (value: Extract<Command, { type: 'download' }>['action']): void => {
              void send({ type: 'download', id: download.id, action: value });
            };
            return (
              <li className="download-item" key={download.id}>
                <div className="file-symbol">
                  <FileIcon filename={download.filename} />
                </div>
                <div className="download-content">
                  <div className="download-title">
                    <h2 className="filename">{download.filename}</h2>
                    <span className={`download-status status-${download.state}`}>
                      {download.state === 'completed' && <Check aria-hidden="true" />}
                      {status[download.state]}
                    </span>
                  </div>
                  <p className="download-meta">
                    {profiles.find((profile) => profile.id === download.profileId)?.name ??
                      'Deleted profile'}
                    <span aria-hidden="true"> · </span>
                    {download.state === 'completed'
                      ? formatBytes(download.received)
                      : `${formatBytes(download.received)}${download.total > 0 ? ` of ${formatBytes(download.total)}` : ' · Size unknown'}`}
                    {download.active && percent !== undefined && <span> · {percent}%</span>}
                  </p>
                  {download.active && (
                    <progress
                      className={download.state === 'paused' ? 'progress-paused' : undefined}
                      aria-label={`Download progress for ${download.filename}`}
                      max={download.total || undefined}
                      value={download.total ? download.received : undefined}
                    />
                  )}
                  {download.state === 'interrupted' && !download.active && (
                    <p className="download-note">Download again from the conversation to retry.</p>
                  )}
                </div>
                <div
                  className="download-actions"
                  role="group"
                  aria-label={`Actions for ${download.filename}`}
                >
                  {download.active && (
                    <>
                      {download.state === 'progressing' && (
                        <button
                          className="icon-button"
                          aria-label="Pause download"
                          title="Pause download"
                          onClick={() => action('pause')}
                        >
                          <Pause />
                        </button>
                      )}
                      {(download.state === 'paused' || download.resumable) && (
                        <button
                          className="icon-button"
                          aria-label="Resume download"
                          title="Resume download"
                          onClick={() => action('resume')}
                        >
                          <Play />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label="Cancel download"
                        title="Cancel download"
                        onClick={() => action('cancel')}
                      >
                        <X />
                      </button>
                    </>
                  )}
                  {download.state === 'completed' && (
                    <>
                      <button className="open-file" onClick={() => action('open')}>
                        Open file
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Show in folder"
                        title="Show in folder"
                        onClick={() => action('reveal')}
                      >
                        <FolderOpen />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <details className="download-help">
        <summary>
          <Info aria-hidden="true" /> About your downloads
        </summary>
        <p>
          Closing a window keeps downloads running. Quitting the app cancels active downloads.
          Interrupted downloads cannot resume after restart. Clearing finished entries does not
          delete your files.
        </p>
      </details>
    </div>
  );
}
