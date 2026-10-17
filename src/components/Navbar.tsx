"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatSessionClock } from "@/lib/limits";
import { useSession } from "@/components/SessionProvider";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/analytics", label: "Analytics" },
  { href: "/sources", label: "Sources" },
];

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

export function Navbar() {
  const pathname = usePathname();
  const { ready, elapsedMs, settings, toggleDeter, showImages, toggleImages } = useSession();
  const clock = ready
    ? formatSessionClock(elapsedMs, settings.sessionLimitMinutes)
    : "–";

  return (
    <header className="nav">
      <Link href="/" className="wordmark">
        smolfeed
      </Link>
      <nav className="nav-links" aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="nav-tools">
        <p className="clock" aria-label={`Session time ${clock}`}>
          {clock}
        </p>
        <button
          type="button"
          className={showImages ? "deter icon on" : "deter icon"}
          aria-pressed={showImages}
          aria-describedby="images-hint"
          onClick={toggleImages}
        >
          <ImageIcon crossed={!showImages} />
        </button>
        <span id="images-hint" className="sr-only">
          Shows images for the sources switched on in Sources settings. Off by default.
        </span>
        <button
          type="button"
          className={settings.deterEnabled ? "deter on" : "deter"}
          aria-pressed={settings.deterEnabled}
          aria-describedby="deter-hint"
          onClick={() => void toggleDeter()}
        >
          Deter
        </button>
        <span id="deter-hint" className="sr-only">
          Gradually shifts the page from full color to grayscale as this session runs.
        </span>
      </div>
    </header>
  );
}
