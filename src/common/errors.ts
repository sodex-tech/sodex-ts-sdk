export class SodexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SodexError";
  }
}

export class InvalidSignatureError extends SodexError {
  constructor(
    message: string,
    public readonly kind: "length" | "type" | "public-key",
  ) {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

export class ApiError extends SodexError {
  constructor(
    public readonly code: number,
    message: string,
    public readonly timestamp: bigint,
    public readonly context: {
      method?: string;
      url?: string;
      status?: number;
    } = {},
  ) {
    super(`API error ${code}: ${message}`);
    this.name = "ApiError";
  }
}

export class TransportError extends SodexError {
  public override readonly cause?: unknown;
  constructor(
    message: string,
    cause?: unknown,
    public readonly context: {
      method?: string;
      url?: string;
      status?: number;
      responseBody?: string;
      timedOut?: boolean;
      aborted?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "TransportError";
    this.cause = cause;
  }
}

export class RegistryNotLoadedError extends SodexError {
  constructor() {
    super("Registry not loaded — call `await client.refreshMarkets()` before trading");
    this.name = "RegistryNotLoadedError";
  }
}

export class UnknownSymbolError extends SodexError {
  constructor(
    public readonly input: string,
    public readonly suggestions: string[] = [],
  ) {
    const hint = suggestions.length ? `; did you mean ${suggestions.slice(0, 3).join(", ")}?` : "";
    super(`Unknown symbol "${input}"${hint}`);
    this.name = "UnknownSymbolError";
  }
}

export class UnknownEnumError extends SodexError {
  constructor(enumName: string, value: unknown) {
    super(`Unknown ${enumName}: ${String(value)}`);
    this.name = "UnknownEnumError";
  }
}
