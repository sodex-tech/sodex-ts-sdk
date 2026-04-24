import { SodexError } from "../common/errors";

export class WsError extends SodexError {
  constructor(message: string) {
    super(message);
    this.name = "WsError";
  }
}

export class WsConnectionError extends WsError {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WsConnectionError";
    this.cause = cause;
  }
}

export class WsProtocolError extends WsError {
  constructor(
    message: string,
    public readonly rawMessage?: string,
  ) {
    super(message);
    this.name = "WsProtocolError";
  }
}
