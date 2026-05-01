// components/admin/AdminShell.tsx
"use client";

import AdminSidebar from "./AdminSidebar";

interface AdminShellProps {
  activePath: string;
  children: React.ReactNode;
}

export default function AdminShell({ activePath, children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar activePath={activePath} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
