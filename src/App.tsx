import { Suspense, lazy } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { GameProvider } from "@/backend/GameProvider";
import { Header } from "@/components/Header";
import { QuantumNebula } from "@/components/ui/quantum-nebula";
import { Skeleton } from "@/components/ui/skeleton";
import Home from "@/pages/Home";

// Harita ilk ekranda; diğer sayfalar istendiğinde yüklensin.
const ProvincePage = lazy(() => import("@/pages/ProvincePage"));
const LeaderboardPage = lazy(() => import("@/pages/LeaderboardPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const HowToPlayPage = lazy(() => import("@/pages/HowToPlayPage"));

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
        <span className="opacity-70">
          Gerçek seçim sonucu değildir; hiçbir partiyle bağlantısı yoktur.
        </span>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <HashRouter>
      <GameProvider>
        {/* Arka plan sahnesi: sabit, etkileşimsiz, içeriğin arkasında */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <QuantumNebula className="absolute inset-0 h-full w-full opacity-75" />
          <div className="absolute inset-0 bg-[radial-gradient(130%_100%_at_50%_-5%,transparent_25%,hsl(225_45%_4%_/_0.6)_80%)]" />
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>

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
