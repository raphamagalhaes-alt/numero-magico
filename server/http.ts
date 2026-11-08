/** fetch com suporte a proxy HTTP(S) corporativo via HTTPS_PROXY/HTTP_PROXY/NO_PROXY. */
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';

export function createFetch(): typeof fetch {
  const hasProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
  if (!hasProxy) return fetch;
  const dispatcher = new EnvHttpProxyAgent();
  return ((url: string, init?: RequestInit) => undiciFetch(url, { ...(init as object), dispatcher } as never)) as unknown as typeof fetch;
}
