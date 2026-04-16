/**
 * WS account state parsers (`accountState` channel).
 *
 * The WS `accountState` channel sends the same wire shape as the REST
 * `GET /accounts/{user}/state` endpoint. We re-export the existing
 * parsers directly — no new code needed.
 */

export { parseSpotAccountSnapshot } from "../../spot/client";
export { parsePerpsAccountSnapshot } from "../../perps/client";
