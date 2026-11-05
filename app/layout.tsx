import type { Metadata, Viewport } from "next";
import { Noto_Sans_Mono } from "next/font/google";
import { PwaRegistration } from "@/components/PwaRegistration";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { builtinThemesCss } from "@/lib/plus-theme-catalog";
import { PLUS_PREFS_SEED_SCRIPT } from "@/lib/plus-prefs";

// Plus: the one look (Claude Code Desktop) ships every built-in palette,
// server-rendered so the first paint is right. There is no theme picker and no
// client-side theme switch: data-plus-style / data-plus-theme are literal.
const PLUS_BUILTIN_THEMES_CSS = builtinThemesCss();
import "katex/dist/katex.min.css";
import "./globals.css";
import "./settings.css";
// Fork-local restyle layer — must come after the upstream stylesheets so its
// equal-specificity rules win the cascade. See app/native-theme.css.
import "./native-theme.css";
import "./plus.css";
import "./plus-theme.css";
import { PRODUCT_NAME } from "@/lib/branding";

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-noto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `${PRODUCT_NAME} interface for the pi coding agent`,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: PRODUCT_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      translate="no"
      className={`${notoSansMono.variable} notranslate`}
      data-plus-style="clean"
      data-plus-theme="clean"
      suppressHydrationWarning
    >
      <head>
        <meta name="google" content="notranslate" />
        {/* Plus: restore mirrored preferences into localStorage before any other script reads them. */}
        <script dangerouslySetInnerHTML={{ __html: PLUS_PREFS_SEED_SCRIPT }} />
        {/* Optional user stylesheet: <agentDir>/desktop/custom.css served by
            /api/custom-css. Empty when the file is absent; no-store so edits
            apply on reload. Loaded last so user rules win the cascade. */}
        {/* Loaded with media="print" and switched to "all" once it arrives: the route
            cold-loads the whole pi SDK, and a blocking stylesheet held the first paint
            for it. The link keeps its place, so the cascade order is unchanged. */}
        {/* Plus: the link is no longer mounted. The interface is one fixed design now and
            the appearance page has no override switch, so a stale custom.css would silently
            re-style everything (the old pi-claude-theme does exactly that). The route and the
            file stay in place; see docs/CUSTOM-CSS.md. */}
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
          }}
        />
        {/* Plus: built-in theme palettes (the single fixed look). */}
        <style id="plus-builtin-themes" dangerouslySetInnerHTML={{ __html: PLUS_BUILTIN_THEMES_CSS }} />
      </head>
      <body translate="no" className="notranslate" suppressHydrationWarning>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
