import { hexToBytes } from "../common/bytes";
import { MAINNET_CHAIN_ID, PERPS_DOMAIN_NAME, makeDomain } from "../common/eip712";
import { EvmSigner, type PrivateKeyInput } from "../common/signer";

export interface PerpsSignerOptions {
  privateKey: PrivateKeyInput;
  chainId?: bigint;
}

export class PerpsSigner extends EvmSigner {
  constructor(opts: PerpsSignerOptions) {
    const chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    const key = typeof opts.privateKey === "string" ? hexToBytes(opts.privateKey) : opts.privateKey;
    super(makeDomain(PERPS_DOMAIN_NAME, chainId), key);
  }
}
