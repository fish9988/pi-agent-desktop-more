/**
 * Local product branding.
 *
 * Keep this separate from the upstream package/repository names so syncing a
 * newer agegr/pi-web release cannot silently change the user-facing brand.
 */
export const PRODUCT_NAME = "Pi Agent Plus" as const;

import desktopPackage from "../src-tauri/pi-agent-desktop-package.json";

/** Name and version of this packaged desktop distribution. */
// Plus fork: an independent build that must never update itself from the
// upstream abcwyc/pi-agent-desktop releases.
export const APP_DISTRIBUTION_NAME = "pi-agent-plus" as const;
export const APP_REPOSITORY = "fish9988/pi-agent-desktop-more" as const;
export const APP_REPOSITORY_URL = `https://github.com/${APP_REPOSITORY}` as const;
export const APP_RELEASES_URL = `${APP_REPOSITORY_URL}/releases` as const;
export const APP_VERSION = desktopPackage.version;
export const APP_VERSION_DISPLAY = APP_VERSION.endsWith(".0")
  ? APP_VERSION.slice(0, -2)
  : APP_VERSION;
