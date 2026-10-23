"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { BusyIndicator } from "./BusyIndicator";
import { Modal } from "./Modal";

/* ───────────── Toast ───────────── */

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/* ───────────── Dialogs ───────────── */

export interface FormOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** radio 用：說明文字與圖示 */
  description?: string;
  icon?: ReactNode;
}

export interface FormField {
  name: string;
  label: string;
  /** checkbox 勾選時值為 "1"，未勾選為 "" */
  type?: "text" | "select" | "emoji" | "textarea" | "email" | "number" | "radio" | "checkbox";
  placeholder?: string;
  defaultValue?: string;
  options?: FormOption[];
  required?: boolean;
  maxLength?: number;
  hint?: string;
}

interface FormOptions {
  title: string;
  description?: ReactNode;
  fields: FormField[];
  submitLabel?: string;
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface DialogApi {
  form: (options: FormOptions) => Promise<Record<string, string> | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs 必須在 Providers 內使用");
  return ctx;
}

const EMOJIS = [
  "📁", "📂", "🗂️", "📝", "📄", "📌", "💡", "⚙️", "🛠️", "🔧", "🧰", "🖥️", "💻", "🟩", "🔥", "🧪",
  "📊", "📈", "🚀", "🐧", "🐳", "📦", "🔐", "✅", "⚠️", "📚", "🧩", "🌐", "🗒️", "📋", "💿", "🩺",
];

function EmojiInput({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div>
      <div className="flex gap-2">
        <input
          name={name}
          className="input w-24 text-center text-lg"
          value={value}
          maxLength={16}
          onChange={(e) => setValue(e.target.value)}
          placeholder="🙂"
        />
        <button type="button" className="btn-ghost" onClick={() => setValue("")}>
          清除
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setValue(e)}
            className={`h-8 w-8 rounded-md text-lg hover:bg-hover ${value === e ? "bg-active" : ""}`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

type DialogState =
  | { kind: "form"; options: FormOptions; resolve: (v: Record<string, string> | null) => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | null;

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 2800);
  }, []);

  const dialogs = useRef<DialogApi>({
    form: (options) => new Promise((resolve) => setDialog({ kind: "form", options, resolve })),
    confirm: (options) => new Promise((resolve) => setDialog({ kind: "confirm", options, resolve })),
  }).current;

  const close = () => {
    if (dialog?.kind === "form") dialog.resolve(null);
    if (dialog?.kind === "confirm") dialog.resolve(false);
    setDialog(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <DialogContext.Provider value={dialogs}>
        {children}

        {dialog?.kind === "form" && (
          <Modal open onClose={close} title={dialog.options.title} size="sm">
            <form
              id="wn-dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const values: Record<string, string> = {};
                for (const f of dialog.options.fields) values[f.name] = String(data.get(f.name) ?? "").trim();
                dialog.resolve(values);
                setDialog(null);
              }}
              className="space-y-4"
            >
              {dialog.options.description && <div className="text-sm text-muted">{dialog.options.description}</div>}
              {dialog.options.fields.map((f, i) =>
                f.type === "radio" ? (
                  <fieldset key={f.name}>
                    <legend className="mb-1.5 block text-sm font-medium">{f.label}</legend>
                    <div className="space-y-1.5">
                      {f.options?.map((o) => (
                        <label
                          key={o.value}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-hover has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                        >
                          <input
                            type="radio"
                            name={f.name}
                            value={o.value}
                            defaultChecked={o.value === f.defaultValue}
                            disabled={o.disabled}
                            className="mt-1 accent-[var(--accent)]"
                          />
                          {o.icon && <span className="mt-0.5 shrink-0 text-muted">{o.icon}</span>}
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{o.label}</span>
                            {o.description && <span className="block text-xs text-muted">{o.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                    {f.hint && <span className="mt-1.5 block text-xs text-muted">{f.hint}</span>}
                  </fieldset>
                ) : f.type === "checkbox" ? (
                  <label key={f.name} className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name={f.name}
                      value="1"
                      defaultChecked={f.defaultValue === "1"}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>
                      {f.label}
                      {f.hint && <span className="mt-0.5 block text-xs text-muted">{f.hint}</span>}
                    </span>
                  </label>
                ) : (
                <label key={f.name} className="block">
                  <span className="mb-1.5 block text-sm font-medium">{f.label}</span>
                  {f.type === "select" ? (
                    <select name={f.name} defaultValue={f.defaultValue} className="input" autoFocus={i === 0}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value} disabled={o.disabled}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "emoji" ? (
                    <EmojiInput name={f.name} defaultValue={f.defaultValue} />
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.name}
                      defaultValue={f.defaultValue}
                      placeholder={f.placeholder}
                      className="input min-h-24"
                      maxLength={f.maxLength}
                      required={f.required}
                      autoFocus={i === 0}
                    />
                  ) : (
                    <input
                      name={f.name}
                      type={f.type ?? "text"}
                      defaultValue={f.defaultValue}
                      placeholder={f.placeholder}
                      className="input"
                      maxLength={f.maxLength ?? 200}
                      required={f.required}
                      autoFocus={i === 0}
                      autoComplete="off"
                    />
                  )}
                  {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
                </label>
                ),
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn" onClick={close}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  {dialog.options.submitLabel ?? "確定"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {dialog?.kind === "confirm" && (
          <Modal
            open
            onClose={close}
            title={dialog.options.title}
            size="sm"
            footer={
              <>
                <button type="button" className="btn" onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className={`${dialog.options.danger ? "btn-danger" : "btn-primary"} primary-action`}
                  onClick={() => {
                    dialog.resolve(true);
                    setDialog(null);
                  }}
                >
                  {dialog.options.confirmLabel ?? "確定"}
                </button>
              </>
            }
          >
            <div className="text-sm leading-relaxed text-muted">{dialog.options.message}</div>
          </Modal>
        )}

        <BusyIndicator />

        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-sm shadow-pop"
              role="status"
            >
              {t.kind === "success" && <CircleCheck size={18} className="mt-0.5 shrink-0 text-accent" />}
              {t.kind === "error" && <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />}
              {t.kind === "info" && <Info size={18} className="mt-0.5 shrink-0 text-muted" />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </DialogContext.Provider>
    </ToastContext.Provider>
  );
}
