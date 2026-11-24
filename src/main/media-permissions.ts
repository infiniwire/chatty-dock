import { urlKind } from './policy';

type MediaType = 'audio' | 'video';

/** In-memory approvals belong to one profile, origin, and media type. */
export class MediaPermissions {
  private grants = new Map<string, Set<MediaType>>();

  constructor(private readonly fixture?: string) {}

  origin(requesting: string, topLevel: string, mainFrame: boolean): string | undefined {
    if (
      !mainFrame ||
      urlKind(requesting, this.fixture) !== 'content' ||
      urlKind(topLevel, this.fixture) !== 'content'
    )
      return;
    try {
      const origin = new URL(requesting).origin;
      return origin === new URL(topLevel).origin ? origin : undefined;
    } catch {
      return;
    }
  }

  types(value: unknown): MediaType[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((item) => item !== 'audio' && item !== 'video')
    )
      return [];
    return [...new Set(value)] as MediaType[];
  }

  has(origin: string, types: MediaType[]): boolean {
    const granted = this.grants.get(origin);
    return types.length > 0 && types.every((type) => granted?.has(type));
  }

  remember(origin: string, types: MediaType[]): void {
    if (!types.length) return;
    const granted = this.grants.get(origin) ?? new Set<MediaType>();
    for (const type of types) granted.add(type);
    this.grants.set(origin, granted);
  }
}
