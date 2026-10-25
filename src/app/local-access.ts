// Chrome and Edge ask before a public website may reach servers on the user's own
// computer. On the preview site this blocked the first connection to llama-server
// ("Permission was denied for this request to access the `loopback` address space");
// allowing the site's "Apps on device" permission fixed it. "Local network access"
// covers other devices on the network and is not needed for 127.0.0.1 or localhost.

export type AddressSpace = "loopback" | "local";

/** Whether a server URL is on this computer or elsewhere on the local network. */
export function addressSpaceOf(url: string): AddressSpace | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return undefined;
  }
  if (host === "localhost" || host === "::1" || /^127\./.test(host)) return "loopback";
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local")) return "local";
  return undefined;
}

/** The permission's name in Chrome's site settings. */
export const PERMISSION_LABEL: Record<AddressSpace, string> = {
  loopback: "Apps on device",
  local: "Local network access",
};

/** Permission names Chrome has used for these, newest first. Unknown names make query() throw. */
const PERMISSION_NAMES: Record<AddressSpace, string[]> = {
  loopback: ["loopback-network", "local-network-access"],
  local: ["local-network", "local-network-access"],
};

export type AccessState = "granted" | "denied" | "prompt";

interface PermissionsLike {
  query(descriptor: { name: string }): Promise<{ state: string }>;
}

/** The browser's permission state for reaching this address space, or undefined if the browser has no such permission. */
export async function accessState(space: AddressSpace, permissions: PermissionsLike | undefined = globalThis.navigator?.permissions as PermissionsLike | undefined): Promise<AccessState | undefined> {
  for (const name of PERMISSION_NAMES[space]) {
    try {
      const { state } = await permissions!.query({ name });
      if (state === "granted" || state === "denied" || state === "prompt") return state;
    } catch {
      // Not a permission this browser knows; try the next name.
    }
  }
  return undefined;
}

/** What to tell the user when the browser blocked the request, or undefined when the permission is not the problem. */
export function describeBlockedAccess(space: AddressSpace, state: AccessState | undefined): string | undefined {
  const where = space === "loopback" ? "servers on this computer" : "devices on your local network";
  const steps = `Click the icon left of the address bar, open Site settings, set "${PERMISSION_LABEL[space]}" to Allow, then reload the page and connect again.`;
  if (state === "denied") return `Your browser is blocking this site from reaching ${where}. ${steps}`;
  if (state === "prompt") return `Your browser needs your permission for this site to reach ${where}. When it asks, choose Allow, or: ${steps}`;
  return undefined;
}
