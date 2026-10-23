"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wn:theme") as Theme | null;
      if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if ((localStorage.getItem("wn:theme") ?? "system") === "system") apply("system");
      } catch {
        apply("system");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label: Record<Theme, string> = { system: "跟隨系統", light: "淺色", dark: "深色" };

  return (
    <button
      type="button"
      className="icon-btn"
      title={`主題：${label[theme]}（點擊切換）`}
      aria-label={`主題：${label[theme]}`}
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        try {
          localStorage.setItem("wn:theme", t);
        } catch {
          /* ignore */
        }
        apply(t);
      }}
    >
      {theme === "light" ? <Sun size={17} /> : theme === "dark" ? <Moon size={17} /> : <Monitor size={17} />}
    </button>
  );
}
