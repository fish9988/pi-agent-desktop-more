/**
 * Local product branding.
 *
 * Keep this separate from the upstream package/repository names so syncing a
 * newer agegr/pi-web release cannot silently change the user-facing brand.
 */
/**
 * Plus build flavor: "test" builds (CI `flavor: test`) install beside the
 * main app with their own name, identifier, port and prefs file.
 */
export const PLUS_TEST_FLAVOR = process.env.NEXT_PUBLIC_PLUS_FLAVOR === "test";
export const PRODUCT_NAME: "Pi Agent Plus" | "Pi Agent Plus Test" = PLUS_TEST_FLAVOR ? "Pi Agent Plus Test" : "Pi Agent Plus";
/** UI display brand shown in the sidebar header and settings overview. */
export const BRAND_DISPLAY_NAME = PLUS_TEST_FLAVOR ? "Pi Atelier Test" : "Pi Atelier";
export const BRAND_BADGE = "纸枢";

import desktopPackage from "../src-tauri/pi-agent-desktop-package.json";
import plusVersion from "../plus-version.json";

/** Name and version of this packaged desktop distribution. */
// Plus fork: an independent build that must never update itself from the
// upstream abcwyc/pi-agent-desktop releases.
export const APP_DISTRIBUTION_NAME = "pi-agent-plus" as const;
export const APP_REPOSITORY = "fish9988/pi-agent-desktop-more" as const;
export const APP_REPOSITORY_URL = `https://github.com/${APP_REPOSITORY}` as const;
export const APP_RELEASES_URL = `${APP_REPOSITORY_URL}/releases` as const;
// Plus has its own semver (plus-version.json, tagged vX.Y.Z on GitHub) so the
// in-app update check compares against this fork's releases.
export const APP_VERSION = plusVersion.version;
/** Upstream pi-agent-desktop version this Plus build is based on. */
export const UPSTREAM_VERSION = desktopPackage.version;
// Plus versions are full semver (1.4.0), shown as-is: "v1.4" read like a
// different release than the v1.4.0 tag on GitHub.
export const APP_VERSION_DISPLAY = APP_VERSION;
