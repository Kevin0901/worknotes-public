import { AiKeyStoreProvider } from "@/components/ai/KeyStore";

/** /ai 與 /ai/keys 共用：「不儲存」的金鑰只放在這個分頁的記憶體，在兩頁之間切換時保留 */
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return <AiKeyStoreProvider>{children}</AiKeyStoreProvider>;
}
