import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-subtle p-4">
      <div className="card w-full max-w-sm p-6 shadow-pop md:p-8">
        <div className="mb-6 text-center">
          <Logo size={52} className="mx-auto mb-3 drop-shadow-sm" />
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
