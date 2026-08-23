import { useCallback, useEffect, useState } from "react";
import { useGame } from "@/backend/GameProvider";
import type { ProvinceDetail } from "@/backend/types";

/** Bir ilin oy tablosu + il başkanlığı koltuklarını yükler. */
export function useProvinceDetail(provinceId: string | null) {
  const { backend } = useGame();
  const [detail, setDetail] = useState<ProvinceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!provinceId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const next = await backend.getProvinceDetail(provinceId);
      setDetail(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İl verisi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [backend, provinceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detail, loading, error, reload };
}
