// 前後端共用的資料型別（不可引入任何 server-only 模組）

export type UserStatus = "pending" | "approved" | "rejected" | "disabled";
export type UserRole = "editor" | "viewer";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
  /** 目前有效的登入裝置數（僅後台列表提供） */
  activeSessions?: number;
}

export type Visibility = "private" | "read" | "edit";

/** 擁有者、空間、可見度，以及目前使用者對此項目的權限 */
export interface AccessInfo {
  ownerId: string | null;
  /** null = 公共區；否則為該使用者的個人空間 */
  spaceUserId: string | null;
  visibility: Visibility;
  /** 目前使用者可否修改內容 */
  canEdit: boolean;
  /** 目前使用者可否變更可見度、移到其他空間（擁有者或管理員） */
  canManage: boolean;
}

export interface Category extends AccessInfo {
  id: string;
  parentId: string | null;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface NoteMeta extends AccessInfo {
  id: string;
  categoryId: string | null;
  title: string;
  icon: string | null;
  tags: string[];
  pinned: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** 側邊欄第一層：公共區與各使用者的個人空間 */
export interface Space {
  /** "public" 或使用者 id */
  key: string;
  userId: string | null;
  name: string;
  isMine: boolean;
  /** 個人空間是否對他人隱藏 */
  hidden: boolean;
  /** 目前使用者能否在此空間最上層新增 */
  canCreate: boolean;
}

export interface Note extends NoteMeta {
  content: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** 互動教學頁：內容在程式中，權限與筆記相同 */
export interface GuideMeta extends AccessInfo {
  slug: string;
  title: string;
  icon: string | null;
  href: string;
}

export interface Tree {
  categories: Category[];
  notes: NoteMeta[];
  /** 目前使用者看得到的互動教學頁 */
  guides: GuideMeta[];
  spaces: Space[];
  /** 擁有者 id → 顯示名稱 */
  owners: Record<string, string>;
}

export interface Revision {
  id: string;
  title: string;
  content: string;
  editedBy: string | null;
  createdAt: string;
}

/** 前端顯示用的目前使用者資訊 */
export interface ViewerInfo {
  kind: "user" | "admin" | "anonymous";
  name: string;
  email: string | null;
  picture: string | null;
  isAdmin: boolean;
  canEdit: boolean;
  /** 目前登入方式（google／qr）與到期時間，用於顯示臨時登入提示 */
  sessionMethod: string | null;
  sessionExpiresAt: string | null;
}

export interface UserSession {
  id: string;
  method: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
}

export interface LoginRequestInfo {
  code: string;
  status: "pending" | "approved" | "denied" | "consumed" | "expired";
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
}

export type CalendarKind = "event" | "task";
export type TaskStatus = "todo" | "doing" | "done";

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  title: string;
  description: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  status: TaskStatus;
  color: string | null;
  visibility: "private" | "shared";
  noteId: string | null;
  createdBy: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export interface Settings {
  siteTitle: string;
  requireLogin: boolean;
  allowRegistration: boolean;
  logPageViews: boolean;
  logRetentionDays: number;
}

export interface AccessLog {
  id: string;
  createdAt: string;
  event: string;
  path: string | null;
  method: string | null;
  actor: string | null;
  actorType: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
  detail: string | null;
}
