"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSessionClock } from "@/lib/limits";
import { useSession } from "@/components/SessionProvider";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/analytics", label: "Analytics" },
  { href: "/sources", label: "Sources" },
];

const MOBILE_QUERY = "(max-width: 760px)";

const ImageIcon = ({ crossed }: { crossed: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m21 16-5-5-9 9" />
    {crossed ? <path d="M3 3l18 18" /> : null}
  </svg>
);

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
  const { ready, elapsedMs, settings, showImages, toggleImages } = useSession();
  const [isMenuOpen, setMenuOpen] = useState(false);
  // Slide transitions run only around a user toggle. Without this, the closed
  // drawer animates out whenever the mobile styles first apply (late CSS, or the
  // viewport crossing the breakpoint), which looks like it opened then closed.
  const [animate, setAnimate] = useState(false);
  const clock = ready
    ? formatSessionClock(elapsedMs, settings.sessionLimitMinutes)
    : "–";

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
        <p className="clock nav-drawer-clock" aria-label={`Session time ${clock}`}>
          {clock}
        </p>
      </nav>
      <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <div className="nav-tools">
        <p className="clock nav-tools-clock" aria-label={`Session time ${clock}`}>
          {clock}
        </p>
        <button
          type="button"
          className={showImages ? "nav-btn icon on" : "nav-btn icon"}
          aria-pressed={showImages}
          aria-describedby="images-hint"
          aria-label="Show images"
          onClick={toggleImages}
        >
          <ImageIcon crossed={!showImages} />
        </button>
        <span id="images-hint" className="sr-only">
          Shows images for the sources switched on in Sources settings. Off by default.
        </span>
      </div>
    </header>
  );
}
