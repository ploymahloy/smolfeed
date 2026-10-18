"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/limits";
import { useSession } from "@/components/SessionProvider";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/sources", label: "Sources" },
  { href: "/analytics", label: "Analytics" }
];

const MOBILE_QUERY = "(max-width: 760px)";

const MenuIcon = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

export function Navbar() {
  const pathname = usePathname();
  const { ready, started, elapsedMs, settings } = useSession();
  const [isMenuOpen, setMenuOpen] = useState(false);
  // Slide transitions run only around a user toggle. Without this, the closed
  // drawer animates out whenever the mobile styles first apply (late CSS, or the
  // viewport crossing the breakpoint), which looks like it opened then closed.
  const [animate, setAnimate] = useState(false);
  const clock =
    ready && started
      ? formatCountdown(elapsedMs, settings.sessionLimitMinutes)
      : "";
  const clockLabel = clock ? `Time remaining: ${clock}` : '';

  // Close the drawer after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While open: Escape closes, the page behind does not scroll, and growing
  // past the mobile breakpoint closes the drawer.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onChange);
    };
  }, [isMenuOpen]);

  return (
    <header className="nav" data-menu-open={isMenuOpen} data-animate={animate}>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={isMenuOpen}
        aria-controls="primary-nav"
        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        onClick={() => {
          setAnimate(true);
          setMenuOpen((open) => !open);
        }}
      >
        <MenuIcon open={isMenuOpen} />
      </button>
      <Link href="/" className="wordmark">
        smolfeed
      </Link>
      <nav id="primary-nav" className="nav-links" aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          );
        })}
        <p className="clock nav-drawer-clock" aria-label={clockLabel}>
          {clock}
        </p>
      </nav>
      <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <div className="nav-tools">
        <p className="clock nav-tools-clock" aria-label={clockLabel}>
          {clock}
        </p>
      </div>
    </header>
  );
}
