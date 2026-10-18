"use client";

import { Navbar } from "@/components/Navbar";
import { SessionProvider } from "@/components/SessionProvider";

function ShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
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
