import { z } from 'zod';

export const profileSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(48) });
export type Profile = z.infer<typeof profileSchema>;
export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(320).max(16000),
  height: z.number().min(240).max(16000),
});
export const settingsSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(profileSchema).min(1).max(30),
    defaultProfileId: z.uuid(),
    downloadDirectory: z.string().max(4096),
    askDownload: z.boolean(),
    theme: z.enum(['system', 'light', 'dark']),
    bounds: boundsSchema.optional(),
    maximized: z.boolean(),
    lastLocations: z.record(z.string(), z.string().max(4096)),
    zoom: z.number().min(0.5).max(2),
    lastAppVersion: z.string().optional(),
  })
  .refine(
    (s) =>
      new Set(s.profiles.map((p) => p.id)).size === s.profiles.length &&
      s.profiles.some((p) => p.id === s.defaultProfileId),
    'Invalid profile references',
  );
export type Settings = z.infer<typeof settingsSchema>;
export type Panel =
  'none' | 'new' | 'profiles' | 'downloads' | 'settings' | 'about' | 'diagnostics';
export const windowLayoutSchema = z.enum([
  'fill',
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'restore',
]);
export type WindowLayout = z.infer<typeof windowLayoutSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot') }),
  z.object({
    type: z.literal('profile-menu'),
    action: z.enum(['open', 'close']),
    restoreFocus: z.boolean().optional(),
    anchor: z
      .object({
        x: z.number().finite().min(-16000).max(16000),
        y: z.number().finite().min(-16000).max(16000),
        width: z.number().finite().positive().max(16000),
        height: z.number().finite().positive().max(16000),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('layout-menu'),
    action: z.enum(['open', 'close']),
    restoreFocus: z.boolean().optional(),
    anchor: z
      .object({
        x: z.number().finite().min(-16000).max(16000),
        y: z.number().finite().min(-16000).max(16000),
        width: z.number().finite().positive().max(16000),
        height: z.number().finite().positive().max(16000),
      })
      .optional(),
  }),
  z.object({ type: z.literal('window-layout'), layout: windowLayoutSchema }),
  z.object({
    type: z.literal('panel'),
    panel: z.enum(['none', 'new', 'profiles', 'downloads', 'settings', 'about', 'diagnostics']),
  }),
  z.object({ type: z.literal('new-window'), profileId: z.uuid().optional() }),
  z.object({ type: z.literal('profile-create'), name: z.string().trim().min(1).max(48) }),
  z.object({
    type: z.literal('profile-rename'),
    id: z.uuid(),
    name: z.string().trim().min(1).max(48),
  }),
  z.object({ type: z.literal('profile-delete'), id: z.uuid() }),
  z.object({ type: z.literal('profile-default'), id: z.uuid() }),
  z.object({ type: z.literal('profile-switch'), id: z.uuid() }),
  z.object({
    type: z.literal('navigate'),
    action: z.enum([
      'back',
      'forward',
      'reload',
      'home',
      'external',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
    ]),
  }),
  z.object({
    type: z.literal('settings'),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    askDownload: z.boolean().optional(),
  }),
  z.object({ type: z.literal('directory') }),
  z.object({
    type: z.literal('download'),
    id: z.uuid(),
    action: z.enum(['pause', 'resume', 'cancel', 'open', 'reveal']),
  }),
  z.object({ type: z.literal('clear-downloads') }),
  z.object({ type: z.literal('diagnostics') }),
  z.object({
    type: z.literal('sign-in-trace'),
    action: z.enum(['start', 'stop', 'copy', 'clear']),
  }),
  z.object({ type: z.literal('updates') }),
  z.object({ type: z.literal('project-page'), page: z.enum(['releases', 'repository']) }),
  z.object({ type: z.literal('update-token'), token: z.string().trim().max(512) }),
]);
export type Command = z.infer<typeof commandSchema>;
export type DownloadRecord = {
  id: string;
  profileId: string;
  windowId: number;
  filename: string;
  path: string;
  received: number;
  total: number;
  state: 'progressing' | 'paused' | 'interrupted' | 'completed' | 'cancelled' | 'failed';
  resumable: boolean;
  active: boolean;
  createdAt: number;
};
export type Diagnostic = { pid: number; type: string; cpu: number; workingSetKB: number };
export type UpdateState = {
  stage:
    | 'idle'
    | 'checking'
    | 'current'
    | 'downloading'
    | 'waiting'
    | 'installing'
    | 'error'
    | 'credentials'
    | 'unsupported'
    | 'development';
  message: string;
  version?: string;
  checkedAt?: number;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  credentialSource?: 'saved' | 'environment' | 'github-cli';
};
export type Snapshot = {
  settings: Settings;
  profileId: string;
  windowNumber: number;
  panel: Panel;
  profileMenuOpen: boolean;
  layoutMenuOpen: boolean;
  windowLayout: WindowLayout | null;
  canRestoreWindowLayout: boolean;
  title: string;
  typography: { fontSize: number; toolbarHeight: number };
  loading: boolean;
  error: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  downloads: DownloadRecord[];
  platform: string;
  version: string;
  notice: string | null;
  update: UpdateState;
  signInTrace?: { recording: boolean; count: number };
};
export type Result = { ok: true; value?: unknown } | { ok: false; error: string };
export interface DockBridge {
  command(command: Command): Promise<Result>;
  subscribe(callback: (snapshot: Snapshot) => void): () => void;
}
