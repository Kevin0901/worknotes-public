"use client";

import { useId } from "react";

/** 網站標誌：線圈筆記本＋鉛筆（固定配色，深淺色主題都適用） */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  // 同一頁可能有多個標誌（例如手機版隱藏的側邊欄），漸層 id 必須唯一，否則會引用到隱藏元素而不顯示
  const gradientId = `wn-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ddc84" />
          <stop offset="1" stopColor="#0f7a5c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <rect x="16" y="13" width="28" height="38" rx="5" fill="#fff" />
      <path d="M16 21h-3M16 29h-3M16 37h-3M16 45h-3" stroke="#d1fae5" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 24h16M22 31h16M22 38h10" stroke="#0f7a5c" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M44 33l8-8a3 3 0 0 1 4 4l-8 8-5.5 1.5z"
        fill="#fde68a"
        stroke="#0f7a5c"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
