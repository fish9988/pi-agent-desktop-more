"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APP_PREF_KEYS, getPrefJson, setPrefJson } from "@/lib/app-prefs";

export interface UserProfileData {
  name: string;
  subtitle?: string;
  /** Preset id (`preset:...`) or a compressed data:image/... URL. */
  avatar: string;
}

interface AvatarPreset {
  id: string;
  label: string;
  svg: string;
}

const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: "preset:terracotta-cat",
    label: "暖阳橘猫",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f5ebe1"/><stop offset="100%" stop-color="#e8d5c4"/></linearGradient></defs><rect width="80" height="80" rx="18" fill="url(#g1)"/><circle cx="40" cy="46" r="22" fill="#cc785c"/><polygon points="20,34 24,14 36,26" fill="#cc785c"/><polygon points="60,34 56,14 44,26" fill="#cc785c"/><polygon points="23,31 26,18 34,26" fill="#f2b8a2"/><polygon points="57,31 54,18 46,26" fill="#f2b8a2"/><ellipse cx="40" cy="51" rx="12" ry="9" fill="#faf5ef"/><circle cx="32" cy="42" r="3.2" fill="#1f1e1b"/><circle cx="48" cy="42" r="3.2" fill="#1f1e1b"/><circle cx="33" cy="41" r="1" fill="#ffffff"/><circle cx="49" cy="41" r="1" fill="#ffffff"/><polygon points="40,48 37,45 43,45" fill="#a9583e"/><path d="M36 51 Q40 54 44 51" stroke="#6c584c" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  },
  {
    id: "preset:sunset-mountain",
    label: "落日远山",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f3d5b5"/><stop offset="60%" stop-color="#e79e85"/><stop offset="100%" stop-color="#cc785c"/></linearGradient></defs><rect width="80" height="80" rx="18" fill="url(#sky)"/><circle cx="52" cy="28" r="11" fill="#faf5ef" opacity="0.92"/><path d="M0 62 L24 38 L46 56 L64 42 L80 54 L80 80 L0 80 Z" fill="#6b4438"/><path d="M0 68 L30 48 L56 64 L80 50 L80 80 L0 80 Z" fill="#2d2320"/></svg>`,
  },
  {
    id: "preset:ink-scholar",
    label: "水墨松竹",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#efe9de"/><circle cx="54" cy="26" r="10" fill="#c44d36" opacity="0.88"/><path d="M12 68 Q28 44 48 56 T80 48 L80 80 L0 80 L0 68 Z" fill="#8b8578" opacity="0.45"/><path d="M0 72 Q26 52 54 64 T80 58 L80 80 L0 80 Z" fill="#2c2a26"/><path d="M24 76 L26 24 M26 38 L16 30 M26 46 L36 38" stroke="#1f1e1b" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  },
  {
    id: "preset:star-explorer",
    label: "星际旅人",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e2238"/><stop offset="100%" stop-color="#3b2d54"/></linearGradient></defs><rect width="80" height="80" rx="18" fill="url(#sp)"/><circle cx="20" cy="20" r="1.5" fill="#fff" opacity="0.8"/><circle cx="62" cy="18" r="2" fill="#ffd166"/><circle cx="66" cy="48" r="1.2" fill="#fff" opacity="0.7"/><circle cx="40" cy="42" r="20" fill="#f4f4f6"/><rect x="25" y="31" width="30" height="18" rx="9" fill="#232946"/><path d="M29 35 Q40 31 51 35" stroke="#8ecae6" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M22 68 Q40 56 58 68 L62 80 L18 80 Z" fill="#e07a5f"/></svg>`,
  },
  {
    id: "preset:shiba-dog",
    label: "元气柴犬",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#e9edc9"/><polygon points="18,34 22,13 35,25" fill="#d48c46"/><polygon points="62,34 58,13 45,25" fill="#d48c46"/><circle cx="40" cy="45" r="22" fill="#e09f5a"/><path d="M22 48 Q40 36 58 48 A22 22 0 0 1 22 48 Z" fill="#faedcd"/><circle cx="32" cy="37" r="3" fill="#faedcd"/><circle cx="48" cy="37" r="3" fill="#faedcd"/><circle cx="32" cy="42" r="3" fill="#222"/><circle cx="48" cy="42" r="3" fill="#222"/><ellipse cx="40" cy="48" rx="3.5" ry="2.5" fill="#222"/><path d="M35 53 Q40 58 45 53" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  },
  {
    id: "preset:matcha-girl",
    label: "森系青年",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#d8e2dc"/><path d="M18 80 Q22 56 40 56 Q58 56 62 80 Z" fill="#52662c"/><circle cx="40" cy="39" r="15" fill="#f9dcc4"/><path d="M23 38 C23 20 57 20 57 38 C53 29 45 27 40 27 C33 27 27 31 23 38 Z" fill="#2f2e2b"/><circle cx="34" cy="40" r="2" fill="#2f2e2b"/><circle cx="46" cy="40" r="2" fill="#2f2e2b"/><path d="M37 46 Q40 49 43 46" stroke="#b56557" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
  },
];

const DEFAULT_PROFILE: UserProfileData = {
  name: "Lai",
  subtitle: "",
  avatar: AVATAR_PRESETS[0].id,
};

function readProfile(): UserProfileData {
  const stored = getPrefJson<Partial<UserProfileData>>(APP_PREF_KEYS.userProfile);
  if (!stored || typeof stored !== "object") return DEFAULT_PROFILE;
  return {
    name: typeof stored.name === "string" && stored.name.trim() ? stored.name.trim().slice(0, 32) : DEFAULT_PROFILE.name,
    subtitle: typeof stored.subtitle === "string" ? stored.subtitle.trim().slice(0, 40) : "",
    avatar: typeof stored.avatar === "string" && stored.avatar ? stored.avatar : DEFAULT_PROFILE.avatar,
  };
}

function resolveAvatarSrc(avatar: string): string {
  const preset = AVATAR_PRESETS.find((item) => item.id === avatar);
  if (preset) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(preset.svg)}`;
  }
  if (avatar.startsWith("data:image/")) return avatar;
  return `data:image/svg+xml;utf8,${encodeURIComponent(AVATAR_PRESETS[0].svg)}`;
}

async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/webp", 0.88));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export function UserProfileControl() {
  const [profile, setProfile] = useState<UserProfileData>(() => readProfile());
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveProfile = (patch: Partial<UserProfileData>) => {
    setProfile((prev) => {
      const next: UserProfileData = {
        ...prev,
        ...patch,
      };
      setPrefJson(APP_PREF_KEYS.userProfile, next);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const avatarSrc = resolveAvatarSrc(profile.avatar);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="sidebar-user-profile"
        title="点击自定义头像与昵称"
        aria-label="自定义用户画像与昵称"
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
          setOpen((v) => !v);
        }}
      >
        <span className="sidebar-user-avatar-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt={profile.name} className="sidebar-user-avatar" />
        </span>
        <span className="sidebar-user-meta">
          <span className="sidebar-user-name">{profile.name || "Lai"}</span>
          {profile.subtitle && <span className="sidebar-user-subtitle">{profile.subtitle}</span>}
        </span>
      </button>

      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="编辑个人画像"
          className="native-popover app-menu sidebar-user-popover"
          style={{
            position: "fixed",
            top: anchor.top,
            left: anchor.left,
            width: 280,
            zIndex: 2500,
          }}
        >
          <div className="sidebar-user-popover-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarSrc} alt="" className="sidebar-user-popover-preview" />
            <div className="sidebar-user-popover-upload">
              <strong>个人画像与昵称</strong>
              <button
                type="button"
                className="config-button config-button-small config-button-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                上传本地照片...
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void compressAvatarFile(file)
                    .then((dataUrl) => saveProfile({ avatar: dataUrl }))
                    .catch(() => {});
                  event.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="sidebar-user-popover-field">
            <label htmlFor="plus-user-name-input">显示昵称</label>
            <input
              id="plus-user-name-input"
              type="text"
              value={profile.name}
              placeholder="输入你的昵称"
              maxLength={24}
              onChange={(event) => saveProfile({ name: event.target.value })}
            />
          </div>

          <div className="sidebar-user-popover-field">
            <label htmlFor="plus-user-sub-input">状态签名（选填）</label>
            <input
              id="plus-user-sub-input"
              type="text"
              value={profile.subtitle ?? ""}
              placeholder="如：专注构建 / Exploring AI"
              maxLength={32}
              onChange={(event) => saveProfile({ subtitle: event.target.value })}
            />
          </div>

          <div className="sidebar-user-popover-presets-label">精选插画头像</div>
          <div className="sidebar-user-popover-presets">
            {AVATAR_PRESETS.map((preset) => {
              const active = profile.avatar === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  className={`sidebar-user-preset-btn${active ? " is-active" : ""}`}
                  onClick={() => saveProfile({ avatar: preset.id })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveAvatarSrc(preset.id)} alt={preset.label} />
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
