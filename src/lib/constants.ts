// 前後端共用的常數

/** 手機核准電腦登入時可選的登入時間（小時） */
export const SESSION_HOUR_OPTIONS = [1, 4, 8, 24] as const;
export const DEFAULT_SESSION_HOURS = 8;

export const LOGIN_METHOD_LABELS: Record<string, string> = {
  google: "Google 登入",
  qr: "手機掃碼登入",
};
