/**
 * Google dönüşünde profilin gerçekten kurulduğunu doğrular.
 *
 * Çalıştırmak için: npm run test:auth
 *
 * Asıl hata buydu: oturum olayı geldiğinde profil yalnızca OKUNUYORDU; yeni
 * kullanıcının satırı olmadığı için null dönüyor ve kimse onu oluşturmuyordu.
 */
import { SupabaseBackend } from "@/backend/supabaseBackend";
import { durum } from "./sahteIstemci";

const backend = new SupabaseBackend();

let gelen: unknown = "hiç";
backend.onAuthChange((u) => { gelen = u; });

console.log("--- açılış: oturum yok ---");
const acilis = await backend.ensureSession({ deviceId: "cihaz-0001", deviceHash: "h" });
console.log("oturumsuz ensureSession profil açtı mı (false olmalı):",
  durum.cagrilar.includes("rpc:ensure_profile"), "| dönen:", acilis);

console.log("--- Google dönüşü: oturum geldi ---");
durum.oturumVar = true;
durum.authCallback!("SIGNED_IN", { user: { id: "auth-1" } });
await new Promise((r) => setTimeout(r, 60));

console.log("ensure_profile çağrıldı mı:", durum.cagrilar.includes("rpc:ensure_profile"));
console.log("kullanıcı geri bildirildi mi:", gelen !== "hiç" && gelen !== null);
console.log("kullanıcı:", JSON.stringify(gelen));
console.log("çağrı sırası:", JSON.stringify(durum.cagrilar));
