import { RegistryNotLoadedError, UnknownSymbolError } from "../common/errors";

export interface CoinInfo {
  id: bigint;
  name: string;
  precision: number;
}

export type CoinRef = string | bigint;

export class CoinRegistry {
  private readonly byId = new Map<bigint, CoinInfo>();
  private readonly byName = new Map<string, CoinInfo>();
  private loaded = false;
  private inflight: Promise<void> | null = null;

  constructor(private readonly fetcher: () => Promise<CoinInfo[]>) {}

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

  load(list: CoinInfo[]): void {
    this.byId.clear();
    this.byName.clear();
    for (const c of list) {
      this.byId.set(c.id, c);
      this.byName.set(c.name, c);
    }
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  list(): CoinInfo[] {
    return [...this.byId.values()];
  }

  resolveId(ref: CoinRef): bigint {
    if (typeof ref === "bigint") return ref;
    this.assertLoaded();
    const info = this.byName.get(ref);
    if (!info) throw new UnknownSymbolError(ref);
    return info.id;
  }

  find(ref: CoinRef): CoinInfo {
    if (typeof ref === "bigint") {
      this.assertLoaded();
      const found = this.byId.get(ref);
      if (!found) throw new UnknownSymbolError(ref.toString());
      return found;
    }
    this.assertLoaded();
    const found = this.byName.get(ref);
    if (!found) throw new UnknownSymbolError(ref);
    return found;
  }

  nameOf(id: bigint): string {
    return this.byId.get(id)?.name ?? id.toString(10);
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new RegistryNotLoadedError();
  }
}
