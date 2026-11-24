import { app, clipboard, Menu, type BrowserWindow, type WebContents } from 'electron';
import { urlKind } from './policy';

export function showContextMenu(
  contents: WebContents,
  owner: BrowserWindow,
  params: Electron.ContextMenuParams,
  openExternal: (url: string) => Promise<void>,
  fixture?: string,
): void {
  const template: Electron.MenuItemConstructorOptions[] = [];
  const add = (label: string, enabled: boolean, action: () => void): void => {
    template.push({
      label,
      enabled,
      click: () => {
        if (!contents.isDestroyed()) action();
      },
    });
  };
  const flags = params.editFlags;
  if (params.isEditable) {
    add('Undo', flags.canUndo, () => contents.undo());
    add('Redo', flags.canRedo, () => contents.redo());
    template.push({ type: 'separator' });
    add('Cut', flags.canCut, () => contents.cut());
  }
  if (params.isEditable || flags.canCopy) add('Copy', flags.canCopy, () => contents.copy());
  if (params.isEditable) add('Paste', flags.canPaste, () => contents.paste());
  if (params.isEditable || flags.canSelectAll)
    add('Select All', flags.canSelectAll, () => contents.selectAll());
  if (params.isEditable && process.platform === 'win32' && app.isEmojiPanelSupported()) {
    template.push({ type: 'separator' });
    add('Emoji', true, () => {
      contents.focus();
      app.showEmojiPanel();
    });
  }
  const link = params.linkURL;
  const image = params.mediaType === 'image' ? params.srcURL : '';
  const safe = (url: string): boolean =>
    Boolean(url) && url.length <= 8192 && urlKind(url, fixture) !== 'blocked';
  const safeImage = (url: string): boolean => {
    if (safe(url)) return true;
    try {
      const parsed = new URL(url);
      return (
        url.length <= 8192 &&
        parsed.protocol === 'blob:' &&
        urlKind(parsed.origin, fixture) !== 'blocked'
      );
    } catch {
      return false;
    }
  };
  if (safe(link)) {
    template.push({ type: 'separator' });
    add('Open Link in Browser', true, () => void openExternal(link).catch(() => {}));
    add('Copy Link Address', true, () => clipboard.writeText(link));
  }
  if (safeImage(image)) {
    template.push({ type: 'separator' });
    add('Copy Image Address', true, () => clipboard.writeText(image));
  }
  if (template.length && !owner.isDestroyed())
    Menu.buildFromTemplate(template).popup({ window: owner });
}
