// 訪問紀錄事件名稱 → 中文說明（前後端共用）

export const EVENT_LABELS: Record<string, string> = {
  page_view: "瀏覽頁面",
  login_success: "Google 登入成功",
  login_pending: "新帳號申請（待審核）",
  login_waiting: "待審核帳號嘗試登入",
  login_denied: "帳號遭拒或停用",
  login_registration_closed: "未開放申請，拒絕登入",
  login_error: "登入失敗",
  logout: "登出",
  qr_login_start: "電腦產生掃碼登入",
  qr_login_approve: "手機核准電腦登入",
  qr_login_deny: "手機拒絕電腦登入",
  login_qr_success: "掃碼登入成功",
  session_revoke: "登出指定裝置",
  session_revoke_admin: "管理員強制登出裝置",
  admin_login_success: "後台登入成功",
  admin_login_failed: "後台登入失敗",
  admin_login_blocked: "後台登入被暫時封鎖",
  admin_logout: "後台登出",
  note_create: "新增筆記",
  note_update: "修改筆記",
  note_delete: "筆記移至垃圾桶",
  note_restore: "還原筆記",
  note_purge: "永久刪除筆記",
  revision_restore: "還原筆記版本",
  trash_empty: "清空垃圾桶",
  category_create: "新增分類",
  category_update: "修改分類",
  category_delete: "刪除分類",
  notes_import: "匯入筆記",
  notes_export: "匯出筆記",
  space_update: "變更個人空間公開設定",
  calendar_create: "新增行事曆項目",
  calendar_update: "修改行事曆項目",
  calendar_delete: "刪除行事曆項目",
  user_add: "管理員新增帳號",
  user_approve: "核准帳號",
  user_reject: "拒絕帳號",
  user_disable: "停用帳號",
  user_role: "變更帳號權限",
  user_delete: "刪除帳號",
  settings_update: "變更系統設定",
  password_change: "變更後台密碼",
  logs_purge: "清除舊紀錄",
};

export const EVENT_GROUPS: { label: string; events: string[] }[] = [
  { label: "頁面瀏覽", events: ["page_view"] },
  {
    label: "登入／登出",
    events: [
      "login_success", "login_pending", "login_waiting", "login_denied",
      "login_registration_closed", "login_error", "logout",
      "qr_login_start", "qr_login_approve", "qr_login_deny", "login_qr_success", "session_revoke",
    ],
  },
  { label: "後台", events: ["admin_login_success", "admin_login_failed", "admin_login_blocked", "admin_logout"] },
  {
    label: "筆記異動",
    events: [
      "note_create", "note_update", "note_delete", "note_restore", "note_purge", "revision_restore",
      "trash_empty", "category_create", "category_update", "category_delete", "notes_import", "notes_export",
      "space_update",
    ],
  },
  { label: "行事曆", events: ["calendar_create", "calendar_update", "calendar_delete"] },
  {
    label: "管理操作",
    events: [
      "user_add", "user_approve", "user_reject", "user_disable", "user_role", "user_delete",
      "session_revoke_admin", "settings_update", "password_change", "logs_purge",
    ],
  },
];

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}
