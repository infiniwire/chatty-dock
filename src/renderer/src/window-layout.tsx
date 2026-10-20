import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PanelsTopLeft, Undo2 } from 'lucide-react';
import type { Command, Result, Snapshot, WindowLayout } from '../../shared/model';

export function WindowLayoutButton({
  state,
  run,
}: {
  state: Snapshot;
  run: (command: Command) => Promise<Result>;
}): React.JSX.Element {
  const pending = useRef(false);
  async function toggle(button: HTMLButtonElement): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    const { x, y, width, height } = button.getBoundingClientRect();
    try {
      await run({
        type: 'layout-menu',
        action: state.layoutMenuOpen ? 'close' : 'open',
        restoreFocus: true,
        anchor: { x, y, width, height },
      });
    } finally {
      pending.current = false;
    }
  }
  return (
    <button
      className={`icon-button layout-trigger${state.layoutMenuOpen ? ' is-selected' : ''}`}
      data-layout-trigger
      aria-label="Window layout"
      title="Window layout"
      aria-haspopup="menu"
      aria-expanded={!!state.layoutMenuOpen}
      onClick={(event) => void toggle(event.currentTarget)}
      onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && !state.layoutMenuOpen) {
          event.preventDefault();
          void toggle(event.currentTarget);
        }
      }}
    >
      <PanelsTopLeft aria-hidden="true" />
    </button>
  );
}

type Preset = {
  id: Exclude<WindowLayout, 'restore'>;
  name: string;
  columns: number;
  rows: number;
  target: number;
};
const groups: { name: string; count: string; items: Preset[] }[] = [
  {
    name: 'Full screen area',
    count: '1',
    items: [{ id: 'fill', name: 'Fill screen', columns: 1, rows: 1, target: 0 }],
  },
  {
    name: 'Half screen',
    count: '2',
    items: [
      { id: 'left', name: 'Left half', columns: 2, rows: 1, target: 0 },
      { id: 'right', name: 'Right half', columns: 2, rows: 1, target: 1 },
      { id: 'top', name: 'Top half', columns: 1, rows: 2, target: 0 },
      { id: 'bottom', name: 'Bottom half', columns: 1, rows: 2, target: 1 },
    ],
  },
  {
    name: 'Quarter screen',
    count: '4',
    items: [
      { id: 'top-left', name: 'Top left quarter', columns: 2, rows: 2, target: 0 },
      { id: 'top-right', name: 'Top right quarter', columns: 2, rows: 2, target: 1 },
      { id: 'bottom-left', name: 'Bottom left quarter', columns: 2, rows: 2, target: 2 },
      { id: 'bottom-right', name: 'Bottom right quarter', columns: 2, rows: 2, target: 3 },
    ],
  },
];

export function WindowLayoutMenu(): React.JSX.Element {
  const [state, setState] = useState<Snapshot>();
  const [error, setError] = useState('');
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = window.dock.subscribe(setState);
    void window.dock.command({ type: 'snapshot' });
    return off;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'system';
  }, [state?.settings.theme]);
  const ready = !!state;
  useEffect(() => {
    if (ready)
      (
        root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
        root.current?.querySelector<HTMLButtonElement>('button')
      )?.focus();
  }, [ready]);
  const close = (restoreFocus: boolean): void => {
    void window.dock
      .command({ type: 'layout-menu', action: 'close', restoreFocus })
      .catch(() => {});
  };
  async function apply(layout: WindowLayout): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setError('');
    try {
      const result = await window.dock.command({ type: 'window-layout', layout });
      if (!result.ok) setError(result.error);
    } catch {
      setError('Could not arrange this window. Please try again.');
    } finally {
      pending.current = false;
    }
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const items = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + items.length) %
            items.length;
    items.forEach((item, i) => {
      item.tabIndex = i === index ? 0 : -1;
    });
    items[index]?.focus();
  }
  return (
    <div
      ref={root}
      className="layout-menu-root"
      role="menu"
      aria-label="Window layout"
      onKeyDown={keydown}
    >
      <div className="layout-menu-heading">
        Window layout<span>This window</span>
      </div>
      <div className="layout-menu-options">
        {groups.map((group) => (
          <div className="layout-menu-row" key={group.count} role="group" aria-label={group.name}>
            <span className="layout-row-count" aria-hidden="true">
              {group.count}
            </span>
            {group.items.map((item) => (
              <button
                key={item.id}
                className="layout-choice"
                role="menuitemradio"
                aria-label={item.name}
                aria-checked={state?.windowLayout === item.id}
                title={item.name}
                tabIndex={
                  state?.windowLayout === item.id || (!state?.windowLayout && item.id === 'fill')
                    ? 0
                    : -1
                }
                onClick={() => void apply(item.id)}
              >
                <span
                  className="layout-preview"
                  aria-hidden="true"
                  style={{
                    gridTemplateColumns: `repeat(${item.columns}, 1fr)`,
                    gridTemplateRows: `repeat(${item.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: item.columns * item.rows }, (_, index) => (
                    <span key={index} className={index === item.target ? 'is-target' : ''} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {error && (
        <div className="layout-menu-error" role="alert">
          {error}
        </div>
      )}
      <div className="layout-menu-footer">
        <button
          role="menuitem"
          tabIndex={-1}
          disabled={!state?.canRestoreWindowLayout}
          onClick={() => void apply('restore')}
        >
          <Undo2 aria-hidden="true" />
          Restore previous size
        </button>
      </div>
    </div>
  );
}
