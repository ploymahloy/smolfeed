"use client";

import { grayscaleAmount } from "@/lib/deter";
import { Navbar } from "@/components/Navbar";
import { SessionProvider, useSession } from "@/components/SessionProvider";

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { elapsedMs, settings } = useSession();
  const amount = grayscaleAmount(
    elapsedMs,
    settings.sessionLimitMinutes,
    settings.deterEnabled,
  );
  return (
    <div className="shell" style={{ filter: `grayscale(${amount})` }} data-grayscale={amount.toFixed(3)}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Navbar />
      <main id="main">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ShellFrame>{children}</ShellFrame>
    </SessionProvider>
  );
}
