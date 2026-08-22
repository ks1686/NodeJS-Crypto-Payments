export class ChainError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ChainError";
    this.chain = options.chain ?? "unknown";
    this.cause = options.cause;
  }
}

export function isChainError(error) {
  return error instanceof ChainError;
}
