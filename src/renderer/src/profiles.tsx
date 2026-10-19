import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Ellipsis, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import type { Command, Panel, Profile, Result, Snapshot } from '../../shared/model';

export type RunCommand = (command: Command) => Promise<Result>;

export function NewWindowPanel({
  state,
  run,
  close,
  manage,
}: {
  state: Snapshot;
  run: RunCommand;
  close: () => void;
  manage: () => void;
}): React.JSX.Element {
  const [mode, setMode] = useState('saved');
  const [selected, setSelected] = useState(state.profileId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Profile>();
  const nameRef = useRef<HTMLInputElement>(null);
  const profileId = state.settings.profiles.some((p) => p.id === selected)
    ? selected
    : state.profileId;
  const profile = state.settings.profiles.find((p) => p.id === profileId)!;
  const atLimit = state.settings.profiles.length >= 30;
  useEffect(() => {
    if (mode === 'separate') nameRef.current?.focus();
  }, [mode]);
  return (
    <form
      className="new-window-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          let id = profileId;
          if (mode === 'separate') {
            let result = created;
            if (!result) {
              const response = await run({ type: 'profile-create', name });
              if (!response.ok) return;
              result = response.value as Profile;
              setCreated(result);
            }
            id = result.id;
          }
          if ((await run({ type: 'new-window', profileId: id })).ok) close();
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="login-choices" disabled={busy}>
        <legend>Choose how to sign in</legend>
        <label className={`login-choice${mode === 'saved' ? ' chosen' : ''}`}>
          <input
            type="radio"
            name="login-mode"
            value="saved"
            checked={mode === 'saved'}
            onChange={() => setMode('saved')}
          />
          <UsersRound aria-hidden="true" />
          <span>
            <strong>Reuse a login</strong>
            <span>Share a saved profile across windows.</span>
          </span>
        </label>
        <label className={`login-choice${mode === 'separate' ? ' chosen' : ''}`}>
          <input
            type="radio"
            name="login-mode"
            value="separate"
            checked={mode === 'separate'}
            onChange={() => setMode('separate')}
          />
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Keep it separate</strong>
            <span>Create a profile with its own login.</span>
          </span>
        </label>
      </fieldset>
      <div className="login-fields">
        {mode === 'saved' ? (
          <>
            <label htmlFor="window-profile">Login profile</label>
            <select
              id="window-profile"
              aria-label="Profile for new window"
              disabled={busy}
              value={profileId}
              onChange={(event) => setSelected(event.target.value)}
            >
              {state.settings.profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.id === state.profileId ? ' · This window' : ''}
                </option>
              ))}
            </select>
            <p className="field-help">
              Uses {profile.name}’s existing login. Signing out affects its other windows.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="window-profile-name">Profile name</label>
            <input
              ref={nameRef}
              id="window-profile-name"
              aria-label="New profile name"
              placeholder="e.g. Work or Personal"
              required
              maxLength={48}
              value={name}
              disabled={busy || !!created}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="field-help">
              {created
                ? 'Profile created. You can retry opening it without creating another one.'
                : atLimit
                  ? 'You have reached the limit of 30 saved profiles.'
                  : 'Sign in once in the new window. You can reuse this profile later.'}
            </p>
          </>
        )}
      </div>
      <div className="form-footer">
        <button className="text-button" type="button" disabled={busy} onClick={manage}>
          Manage login profiles
        </button>
        <button
          className="primary action-button"
          disabled={busy || (mode === 'separate' && (!name.trim() || atLimit) && !created)}
        >
          <Plus aria-hidden="true" />
          {busy ? 'Opening…' : mode === 'separate' ? 'Create & open' : 'Open window'}
        </button>
      </div>
    </form>
  );
}

function ProfileMenu({
  profile,
  current,
  isDefault,
  disabled,
  rename,
  run,
}: {
  profile: Profile;
  current: boolean;
  isDefault: boolean;
  disabled: boolean;
  rename: () => void;
  run: RunCommand;
}): React.JSX.Element {
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = (): void => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector('summary')?.focus();
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent): void => {
      if (menu.current?.open && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return (
    <details
      className="profile-menu"
      ref={menu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          menu.current.open = false;
          menu.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        id={`profile-menu-${profile.id}`}
        aria-label={`More actions for ${profile.name}`}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <Ellipsis aria-hidden="true" />
      </summary>
      <div
        className="profile-menu-items"
        role="group"
        aria-label={`Profile actions for ${profile.name}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            closeMenu();
            rename();
          }}
        >
          Rename
        </button>
        <button
          type="button"
          disabled={disabled || isDefault}
          onClick={() => {
            closeMenu();
            void run({ type: 'profile-default', id: profile.id });
          }}
        >
          {isDefault ? 'Default profile' : 'Make default'}
        </button>
        <button
          className="danger"
          type="button"
          disabled={disabled || current}
          title={
            current
              ? 'This profile is in use by this window.'
              : 'Delete the profile and its saved login data'
          }
          onClick={() => {
            closeMenu();
            void run({ type: 'profile-delete', id: profile.id });
          }}
        >
          Delete profile
        </button>
      </div>
    </details>
  );
}

export function ProfilesPanel({
  state,
  run,
}: {
  state: Snapshot;
  run: RunCommand;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const renameTrigger = useRef<string | undefined>(undefined);
  const restoreEditFocus = useRef(false);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreEditFocus.current) {
      restoreEditFocus.current = false;
      if (renameTrigger.current) document.getElementById(renameTrigger.current)?.focus();
    }
  }, [editing]);
  const finishEdit = (): void => {
    restoreEditFocus.current = true;
    setEditing(undefined);
  };
  const perform: RunCommand = async (command) => {
    setBusy(true);
    setMessage('');
    try {
      return await run(command);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="profiles-panel">
      <ul className="profiles-list" aria-label="Saved login profiles">
        {state.settings.profiles.map((profile) => (
          <li className="saved-profile" key={profile.id}>
            <span className="profile-avatar" aria-hidden="true">
              {Array.from(profile.name)[0]?.toUpperCase()}
            </span>
            {editing === profile.id ? (
              <form
                className="rename-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy) return;
                  const result = await perform({
                    type: 'profile-rename',
                    id: profile.id,
                    name: draft,
                  });
                  if (result.ok) {
                    finishEdit();
                    setMessage('Profile renamed.');
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    finishEdit();
                  }
                }}
              >
                <input
                  ref={inputRef}
                  aria-label="Rename profile"
                  required
                  maxLength={48}
                  value={draft}
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button className="primary" disabled={busy || !draft.trim()}>
                  Save name
                </button>
                <button type="button" disabled={busy} onClick={finishEdit}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="profile-info">
                  <h2>
                    {profile.name}
                    {profile.id === state.settings.defaultProfileId && (
                      <span className="badge">Default</span>
                    )}
                  </h2>
                  <p>
                    {profile.id === state.profileId ? 'Used by this window' : 'Separate profile'}
                  </p>
                </div>
                <div className="profile-actions">
                  <button
                    disabled={busy}
                    onClick={() => void perform({ type: 'new-window', profileId: profile.id })}
                  >
                    Open window
                  </button>
                  <ProfileMenu
                    profile={profile}
                    current={profile.id === state.profileId}
                    isDefault={profile.id === state.settings.defaultProfileId}
                    disabled={busy}
                    run={perform}
                    rename={() => {
                      renameTrigger.current = `profile-menu-${profile.id}`;
                      setEditing(profile.id);
                      setDraft(profile.name);
                      setMessage('');
                    }}
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <section className="profile-add" aria-labelledby="add-profile-title">
        <h2 id="add-profile-title">Add a profile</h2>
        <p>Keep another account separate, ready for your next window.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const result = await perform({ type: 'profile-create', name });
            if (result.ok) {
              setMessage(`${name.trim()} added.`);
              setName('');
            }
          }}
        >
          <input
            aria-label="Profile name"
            placeholder="e.g. Work"
            required
            maxLength={48}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <button disabled={busy || !name.trim() || state.settings.profiles.length >= 30}>
            <Plus aria-hidden="true" /> Create profile
          </button>
        </form>
        <div className="saved-feedback" role="status">
          {message && (
            <>
              <Check aria-hidden="true" />
              {message}
            </>
          )}
        </div>
      </section>
      <details className="download-help profile-help">
        <summary>
          <ShieldCheck aria-hidden="true" /> How login sharing works{' '}
          <ChevronDown className="disclosure-chevron" aria-hidden="true" />
        </summary>
        <p>
          Windows using the same profile share cookies and sign-in. Signing out affects all of them.
          Different profiles keep website storage separate. Profiles signed into the same ChatGPT
          account still share its cloud conversation history.
        </p>
      </details>
    </div>
  );
}

export const panelDescriptions: Partial<Record<Panel, string>> = {
  new: 'Another conversation. Your choice of login.',
  profiles: 'Saved logins for work, personal, and everything in between.',
  settings: 'Make this workspace feel like yours.',
  downloads: 'Files saved from your conversations.',
};
