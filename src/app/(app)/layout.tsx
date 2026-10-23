import { AppShell } from "@/components/AppShell";
import { SetupNotice } from "@/components/SetupNotice";
import { getViewer, viewerInfo } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase()) return <SetupNotice />;
  const viewer = await getViewer();
  // 沒有權限時不載入任何資料，由各頁面導向登入頁
  if (!viewer.canView) return <>{children}</>;
  const { tree } = await loadWorkspace();
  return (
    <AppShell tree={tree} viewer={viewerInfo(viewer)} siteTitle={viewer.settings.siteTitle}>
      {children}
    </AppShell>
  );
}
