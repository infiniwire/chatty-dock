import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, CircleUserRound, UsersRound } from 'lucide-react';
import type { Command, Result, Snapshot } from '../../shared/model';

export function ProfileSwitcher({
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
      const result = await run({
        type: 'profile-menu',
        action: state.profileMenuOpen ? 'close' : 'open',
        restoreFocus: true,
        anchor: { x, y, width, height },
      });
      // An already-running older main process needs a restart to load the new menu.
      if (!result.ok && result.error === 'Invalid command.')
        await run({ type: 'panel', panel: 'profiles' });
    } finally {
      pending.current = false;
    }
  }
  return (
    <button
      className="profile-switcher"
      data-profile-trigger
      aria-label="Active login profile"
      aria-haspopup="menu"
      aria-expanded={!!state.profileMenuOpen}
      title="Switch login profile"
      onClick={(event) => void toggle(event.currentTarget)}
      onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && !state.profileMenuOpen) {
          event.preventDefault();
          void toggle(event.currentTarget);
        }
      }}
    >
      <CircleUserRound aria-hidden="true" />
      <span>
        {state.settings.profiles.find((profile) => profile.id === state.profileId)?.name ??
          'Profile'}
      </span>
      <ChevronDown className="profile-chevron" aria-hidden="true" />
    </button>
  );
}

export function ProfileMenuSurface(): React.JSX.Element {
  const [state, setState] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(0);
  const typeahead = useRef({ text: '', time: 0 });
  useEffect(() => {
    const off = window.dock.subscribe(setState);
    void window.dock.command({ type: 'snapshot' });
    return off;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'system';
    document.documentElement.style.setProperty(
      '--chat-font-size',
      `${state?.typography.fontSize ?? 16}px`,
    );
  }, [state?.settings.theme, state?.typography.fontSize]);
  const profileId = state?.profileId;
  const count = state?.settings.profiles.length;
  useEffect(() => {
    const current = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    current?.focus();
  }, [profileId, count]);
  const items = (): HTMLButtonElement[] => [
    ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []),
  ];
  function focus(index: number): void {
    const buttons = items();
    activeIndex.current = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      button.tabIndex = i === activeIndex.current ? 0 : -1;
    });
    buttons[activeIndex.current]?.focus();
  }
  async function close(restoreFocus = false): Promise<void> {
    await window.dock
      .command({ type: 'profile-menu', action: 'close', restoreFocus })
      .catch(() => {});
  }
  async function choose(command: Command): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.dock.command(command);
      if (result.ok) await close();
      else {
        setError(result.error);
        setBusy(false);
      }
    } catch {
      setError('Could not switch profiles. Please try again.');
      setBusy(false);
    }
  }
  function keydown(event: KeyboardEvent): void {
    const current = items().indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape' || event.key === 'Tab') void close(true);
      else
        focus(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items().length - 1
              : current + (event.key === 'ArrowDown' ? 1 : -1),
        );
    } else if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const prefix =
        (now - typeahead.current.time < 700 ? typeahead.current.text : '') +
        event.key.toLocaleLowerCase();
      typeahead.current = { text: prefix, time: now };
      const profiles = state?.settings.profiles ?? [];
      const match = profiles.findIndex((profile) =>
        profile.name.toLocaleLowerCase().startsWith(prefix),
      );
      if (match >= 0) {
        event.preventDefault();
        focus(match);
      }
    }
  }
  return (
    <div
      className="profile-menu-root"
      ref={menu}
      role="menu"
      aria-label="Login profiles"
      aria-busy={busy}
      onKeyDown={keydown}
    >
      <div className="profile-menu-caption">Switch profile</div>
      <div className="profile-menu-list" role="group" aria-label="Saved profiles">
        {state?.settings.profiles.map((profile) => (
          <button
            key={profile.id}
            role="menuitemradio"
            aria-checked={profile.id === state.profileId}
            aria-label={profile.name}
            tabIndex={profile.id === state.profileId ? 0 : -1}
            onFocus={(event) => {
              activeIndex.current = items().indexOf(event.currentTarget);
            }}
            onClick={() =>
              profile.id === state.profileId
                ? void close()
                : void choose({ type: 'profile-switch', id: profile.id })
            }
          >
            <span className="profile-menu-avatar" aria-hidden="true">
              {profile.name.slice(0, 1).toLocaleUpperCase()}
            </span>
            <span className="profile-menu-name">{profile.name}</span>
            {profile.id === state.settings.defaultProfileId && (
              <span className="profile-menu-default">Default</span>
            )}
            <span className="profile-menu-check">
              {profile.id === state.profileId && <Check aria-hidden="true" />}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <div className="profile-menu-error" role="alert">
          {error}
        </div>
      )}
      <div className="profile-menu-footer">
        <button
          role="menuitem"
          tabIndex={-1}
          onClick={() => void choose({ type: 'panel', panel: 'profiles' })}
        >
          <UsersRound aria-hidden="true" />
          <span>Manage profiles</span>
        </button>
      </div>
    </div>
  );
}
