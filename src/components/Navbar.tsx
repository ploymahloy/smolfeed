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

export function Navbar() {
  const pathname = usePathname();
  const { ready, elapsedMs, settings, toggleDeter } = useSession();
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
