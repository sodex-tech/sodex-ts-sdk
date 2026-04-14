import { RegistryNotLoadedError, UnknownSymbolError } from "../common/errors";

export interface SymbolInfo {
  id: bigint;
  name: string;
  displayName: string;
}

export type SymbolRef = string | bigint;

export class SymbolRegistry {
  private readonly byId = new Map<bigint, SymbolInfo>();
  private readonly byName = new Map<string, SymbolInfo>();
  private readonly byDisplay = new Map<string, SymbolInfo>();
  private loaded = false;
  private inflight: Promise<void> | null = null;

  constructor(private readonly fetcher: () => Promise<SymbolInfo[]>) {}

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh();
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async doRefresh(): Promise<void> {
    const list = await this.fetcher();
    this.load(list);
  }

  load(list: SymbolInfo[]): void {
    this.byId.clear();
    this.byName.clear();
    this.byDisplay.clear();
    for (const s of list) {
      this.byId.set(s.id, s);
      this.byName.set(s.name, s);
      if (s.displayName) this.byDisplay.set(s.displayName, s);
    }
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  list(): SymbolInfo[] {
    return [...this.byId.values()];
  }

  resolveId(ref: SymbolRef): bigint {
    if (typeof ref === "bigint") return ref;
    const info = this.find(ref);
    return info.id;
  }

  find(ref: SymbolRef): SymbolInfo {
    if (typeof ref === "bigint") {
      this.assertLoaded();
      const found = this.byId.get(ref);
      if (!found) {
        throw new UnknownSymbolError(ref.toString(), this.suggest(ref.toString()));
      }
      return found;
    }
    this.assertLoaded();
    const info = this.byDisplay.get(ref) ?? this.byName.get(ref);
    if (!info) {
      throw new UnknownSymbolError(ref, this.suggest(ref));
    }
    return info;
  }

  displayNameOf(id: bigint): string {
    const info = this.byId.get(id);
    if (!info) return id.toString(10);
    return info.displayName || info.name;
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new RegistryNotLoadedError();
  }

  private suggest(input: string): string[] {
    if (!this.loaded) return [];
    const lower = input.toLowerCase();
    const hits = new Set<string>();
    for (const info of this.byId.values()) {
      if (info.displayName.toLowerCase().includes(lower)) hits.add(info.displayName);
      else if (info.name.toLowerCase().includes(lower)) hits.add(info.name);
      if (hits.size >= 5) break;
    }
    return [...hits];
  }
}
