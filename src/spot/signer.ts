import { hexToBytes } from "../common/bytes";
import { MAINNET_CHAIN_ID, SPOT_DOMAIN_NAME, makeDomain } from "../common/eip712";
import { EvmSigner, type PrivateKeyInput } from "../common/signer";

export interface SpotSignerOptions {
  privateKey: PrivateKeyInput;
  chainId?: bigint;
}

export class SpotSigner extends EvmSigner {
  constructor(opts: SpotSignerOptions) {
    const chainId = opts.chainId ?? MAINNET_CHAIN_ID;
    const key = typeof opts.privateKey === "string" ? hexToBytes(opts.privateKey) : opts.privateKey;
    super(makeDomain(SPOT_DOMAIN_NAME, chainId), key);
  }
}
