import type { ReactNode } from "react";
import { Footer } from "./footer";

interface RootLayoutProps {
  children: ReactNode;
}

/** Mobile-first app shell: content grows, footer (with the disclaimer) always at the bottom. */
export function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <Footer />
    </div>
  );
}
