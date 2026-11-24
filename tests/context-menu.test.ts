import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  popup: vi.fn(),
  clipboard: vi.fn(),
  emoji: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isEmojiPanelSupported: () => true, showEmojiPanel: mocks.emoji },
  clipboard: { writeText: mocks.clipboard },
  Menu: { buildFromTemplate: mocks.build },
}));
import { showContextMenu } from '../src/main/context-menu';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.build.mockReturnValue({ popup: mocks.popup });
});

describe('website context menu', () => {
  it('routes editing actions to the originating page and follows enabled flags', () => {
    const contents = {
      isDestroyed: vi.fn(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      focus: vi.fn(),
    };
    const owner = { isDestroyed: () => false };
    const params = {
      isEditable: true,
      editFlags: {
        canUndo: true,
        canRedo: false,
        canCut: true,
        canCopy: true,
        canPaste: true,
        canSelectAll: true,
      },
      linkURL: '',
      srcURL: '',
      mediaType: 'none',
    };
    showContextMenu(
      contents as unknown as Electron.WebContents,
      owner as Electron.BrowserWindow,
      params as Electron.ContextMenuParams,
      vi.fn(),
    );
    const items = mocks.build.mock.calls[0][0] as Electron.MenuItemConstructorOptions[];
    for (const [label, method] of [
      ['Undo', 'undo'],
      ['Cut', 'cut'],
      ['Copy', 'copy'],
      ['Paste', 'paste'],
      ['Select All', 'selectAll'],
    ] as const) {
      const item = items.find((entry) => entry.label === label)!;
      expect(item.enabled).toBe(true);
      item.click!(null as never, null as never, null as never);
      expect(contents[method]).toHaveBeenCalledOnce();
    }
    expect(items.find((entry) => entry.label === 'Redo')?.enabled).toBe(false);
    contents.isDestroyed.mockReturnValue(true);
    items.find((entry) => entry.label === 'Copy')!.click!(
      null as never,
      null as never,
      null as never,
    );
    expect(contents.copy).toHaveBeenCalledOnce();
    expect(mocks.popup).toHaveBeenCalledWith({ window: owner });
  });

  it('offers only safe external links and copyable image addresses', async () => {
    const contents = { isDestroyed: () => false } as Electron.WebContents;
    const owner = { isDestroyed: () => false } as Electron.BrowserWindow;
    const params = {
      isEditable: false,
      editFlags: { canCopy: false, canSelectAll: false },
      linkURL: 'https://example.com/path',
      srcURL: 'blob:https://chatgpt.com/image-id',
      mediaType: 'image',
    } as Electron.ContextMenuParams;
    const open = vi.fn(async () => {});
    showContextMenu(contents, owner, params, open);
    const items = mocks.build.mock.calls[0][0] as Electron.MenuItemConstructorOptions[];
    items.find((item) => item.label === 'Open Link in Browser')!.click!(
      null as never,
      null as never,
      null as never,
    );
    expect(open).toHaveBeenCalledWith('https://example.com/path');
    items.find((item) => item.label === 'Copy Image Address')!.click!(
      null as never,
      null as never,
      null as never,
    );
    expect(mocks.clipboard).toHaveBeenCalledWith('blob:https://chatgpt.com/image-id');
    vi.clearAllMocks();
    showContextMenu(
      contents,
      owner,
      { ...params, linkURL: 'javascript:alert(1)', srcURL: 'file:///private' },
      open,
    );
    expect(mocks.build).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
