"use client";

// Hover-triggered dropdown anchored to the header user chip. Shows
// Profile / Settings / Friends (and Admin for admins) plus Sign out at
// the bottom. Sign-out opens a styled confirmation modal — same
// FACEIT-card look as the rest of the UI, easier to read than the
// browser's native confirm() and harder to mis-click.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "@/app/components/ui/Avatar";
import { logout } from "@/app/login/actions";

type Props = {
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  isAdmin: boolean;
};

const HOVER_CLOSE_DELAY_MS = 180;

export default function UserMenu({
  nickname,
  avatarUrl,
  level,
  elo,
  isAdmin,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  // Outside-click fallback — defensive in case the user tabs away or
  // touches outside without firing mouseleave (touch devices).
  useEffect(() => {
    if (!open || confirmingLogout) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, confirmingLogout]);

  // Close the dropdown on Escape; close the modal too.
  useEffect(() => {
    if (!open && !confirmingLogout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setConfirmingLogout(false);
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, confirmingLogout]);

  const openLogoutConfirm = () => {
    cancelClose();
    setConfirmingLogout(true);
    setOpen(false);
  };

  const profileHref = `/profile/${encodeURIComponent(nickname)}`;

  return (
    <>
      <div
        ref={wrapperRef}
        className="relative"
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <Link
          href={profileHref}
          className="flex items-center gap-2 hover:bg-surface-hi px-2 py-1 transition-colors"
        >
          <div className="relative">
            <Avatar
              nickname={nickname}
              avatarUrl={avatarUrl}
              size={36}
              shape="square"
              color="#1ed3ff"
            />
            <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-gold text-black px-1 leading-tight">
              {level}
            </span>
          </div>
          <div className="hidden sm:flex flex-col leading-tight items-start">
            <span className="text-xs font-bold tracking-widest text-white">
              {nickname.toUpperCase()}
            </span>
            <span className="text-[10px] text-dim font-mono">{elo} ELO</span>
          </div>
        </Link>

        {open && (
          <div
            className="absolute right-0 top-full mt-1 w-56 bg-surface border border-stroke shadow-xl shadow-black/60 z-50 flex flex-col"
            style={{ borderTop: "3px solid var(--color-accent)" }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="px-4 py-3 border-b border-stroke flex flex-col gap-0.5">
              <span className="font-head text-[10px] text-dim">
                Signed in as
              </span>
              <span className="font-head text-sm text-white truncate">
                {nickname.toUpperCase()}
              </span>
            </div>

            <MenuLink href={profileHref}>Profile</MenuLink>
            <MenuLink href="/settings">Settings</MenuLink>
            <MenuLink href="/friends">Friends</MenuLink>
            {isAdmin && (
              <MenuLink href="/admin/avatars" accent="var(--color-purple2)">
                Admin · avatars
              </MenuLink>
            )}

            <button
              type="button"
              onClick={openLogoutConfirm}
              className="border-t border-stroke font-head text-xs text-lose hover:bg-lose/10 px-4 py-2.5 text-left transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {confirmingLogout && (
        <LogoutConfirmModal
          nickname={nickname}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </>
  );
}

function MenuLink({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="font-head text-xs text-mute hover:text-white hover:bg-surface-hi px-4 py-2.5 transition-colors"
      style={accent ? { color: accent } : undefined}
    >
      {children}
    </Link>
  );
}

function LogoutConfirmModal({
  nickname,
  onCancel,
}: {
  nickname: string;
  onCancel: () => void;
}) {
  // Mount via portal so the modal escapes any `transform` / `sticky`
  // ancestor stacking context. Without this it can render off-centre
  // (anchored to the header column instead of the viewport).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Lock body scroll while the modal is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <style>{`
        @keyframes logout-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .logout-modal-card { animation: logout-modal-in 0.2s ease-out forwards; }
      `}</style>
      <div
        className="logout-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: "4px solid var(--color-lose)" }}
      >
        <div className="px-6 py-5 border-b border-stroke">
          <span className="font-head text-xs text-lose">Confirm</span>
          <h2
            id="logout-modal-title"
            className="font-head text-3xl text-white leading-tight mt-1"
          >
            SIGN OUT?
          </h2>
        </div>
        <div className="px-6 py-5 font-body text-base text-mute leading-relaxed">
          You&apos;ll be signed out as{" "}
          <span className="text-white font-semibold">
            {nickname.toUpperCase()}
          </span>{" "}
          and sent back to the login screen.
        </div>
        <div className="flex border-t border-stroke">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 font-head text-sm text-mute hover:text-white hover:bg-surface-hi px-5 py-4 transition-colors"
          >
            Cancel
          </button>
          <form action={logout} className="flex-1 border-l border-stroke">
            <button
              type="submit"
              className="w-full font-head text-sm font-extrabold text-white bg-lose hover:opacity-90 px-5 py-4 transition-opacity"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
