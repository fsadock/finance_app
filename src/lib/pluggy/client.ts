import { PluggyClient } from "pluggy-sdk";

let _client: PluggyClient | null = null;

export function getPluggy() {
  if (!_client) {
    const clientId = process.env.PLUGGY_CLIENT_ID;
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET missing in env");
    }
    _client = new PluggyClient({ clientId, clientSecret });
  }
  return _client;
}
