import { Suspense, lazy } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { GameProvider } from "@/backend/GameProvider";
import { Header } from "@/components/Header";
import { LeaderReminder } from "@/components/LeaderReminder";
import { useCheckoutConfirm } from "@/hooks/useCheckoutConfirm";
import { SignInDialog } from "@/components/SignInDialog";
import { NeuroNoise } from "@/components/ui/neuro-noise";
import { Skeleton } from "@/components/ui/skeleton";
import Home from "@/pages/Home";

// Harita ilk ekranda; diğer sayfalar istendiğinde yüklensin.
const ProvincePage = lazy(() => import("@/pages/ProvincePage"));
const LeaderboardPage = lazy(() => import("@/pages/LeaderboardPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const HowToPlayPage = lazy(() => import("@/pages/HowToPlayPage"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const TimelapsePage = lazy(() => import("@/pages/TimelapsePage"));

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-5">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-4 py-5 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>
          <strong className="font-display text-foreground">partim.lol</strong> — bir siyaset
          simülasyonu oyunu.
        </span>
        <Link to="/nasil-oynanir" className="underline underline-offset-2 hover:text-foreground">
          Nasıl oynanır
        </Link>
        <Link to="/zaman-tuneli" className="underline underline-offset-2 hover:text-foreground">
          Zaman tüneli
        </Link>
        <Link to="/kosullar" className="underline underline-offset-2 hover:text-foreground">
          Kullanım Koşulları
        </Link>
        <Link to="/gizlilik" className="underline underline-offset-2 hover:text-foreground">
          Gizlilik
        </Link>
        <span className="opacity-70">
          Gerçek seçim sonucu değildir; hiçbir partiyle bağlantısı yoktur.
        </span>
      </div>
    </footer>
  );
}

/**
 * Router ve GameProvider'ın İÇİNDE olmak zorunda olan kancalar.
 * useSearchParams ve useGame ikisi de bağlamdan besleniyor.
 */
function Kancalar() {
  useCheckoutConfirm();
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <GameProvider>
        <Kancalar />
        {/* Arka plan sahnesi: sabit, etkileşimsiz, içeriğin arkasında */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <NeuroNoise className="absolute inset-0 h-full w-full" />
          {/* İçeriğin okunabilir kalması için sahnenin üstüne yumuşak bir örtü */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,hsl(222_40%_4%_/_0.45)_0%,hsl(222_40%_4%_/_0.78)_60%,hsl(222_40%_4%_/_0.92)_100%)]" />
        </div>

        <div className="flex min-h-full flex-col">
          <Header />
          <main className="flex flex-1 flex-col">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/il/:provinceId" element={<ProvincePage />} />
                <Route path="/siralama" element={<LeaderboardPage />} />
                <Route path="/profil" element={<ProfilePage />} />
                <Route path="/nasil-oynanir" element={<HowToPlayPage />} />
                <Route path="/zaman-tuneli" element={<TimelapsePage />} />
                <Route path="/kosullar" element={<LegalPage />} />
                <Route path="/gizlilik" element={<LegalPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>

        {/* Saat başı il başkanlığı hatırlatması */}
        <LeaderReminder />

        {/* Giriş penceresi: yalnızca hesap gerektiren bir eylemde açılır */}
        <SignInDialog />

        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            style: {
              background: "hsl(224 44% 6% / 0.94)",
              border: "1px solid rgb(255 255 255 / 0.1)",
              color: "hsl(210 40% 98%)",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </GameProvider>
    </HashRouter>
  );
}
