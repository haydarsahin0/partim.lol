import { useMemo, useState } from "react";
import type { ProvinceStanding } from "@/backend/types";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { VOTE_COOLDOWN_MS } from "@/lib/game";

type FootballMapStore = {
  votes: Record<string, Record<string, number>>;
  nextVoteAt: string | null;
};

const STORAGE_KEY = "partim.lol/football-map/v1";

function emptyStore(): FootballMapStore {
  return { votes: {}, nextVoteAt: null };
}

function loadStore(): FootballMapStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as FootballMapStore;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      votes: parsed.votes ?? {},
      nextVoteAt: parsed.nextVoteAt ?? null,
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: FootballMapStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage kapali olabilir.
  }
}

function standingFor(provinceId: string, votes: Record<string, Record<string, number>>): ProvinceStanding {
  const row = votes[provinceId] ?? {};
  const totalVotes = Object.values(row).reduce((sum, value) => sum + value, 0);
  const tallies = Object.entries(row)
    .filter(([, value]) => value > 0)
    .map(([partyId, value]) => ({
      partyId,
      votes: value,
      pct: totalVotes > 0 ? (value / totalVotes) * 100 : 0,
    }))
    .sort((a, b) => b.votes - a.votes);

  return {
    provinceId,
    totalVotes,
    tallies,
    leadingPartyId: tallies[0]?.partyId ?? null,
    margin:
      tallies.length > 1 ? tallies[0].pct - tallies[1].pct : tallies.length === 1 ? 100 : 0,
  };
}

export function useFootballMapGame() {
  const [store, setStore] = useState<FootballMapStore>(() => loadStore());

  const standings = useMemo(() => {
    const next: Record<string, ProvinceStanding> = {};
    for (const province of PROVINCES) {
      next[province.id] = standingFor(province.id, store.votes);
    }
    return next;
  }, [store.votes]);

  const vote = (provinceId: string, teamId: string) => {
    if (!PROVINCE_BY_ID[provinceId]) {
      return { ok: false, message: "Bilinmeyen il." };
    }

    const now = Date.now();
    const nextVoteAt = store.nextVoteAt ? Date.parse(store.nextVoteAt) : 0;
    if (nextVoteAt > now) {
      return { ok: false, message: "Oy hakkın henüz dolmadı." };
    }

    const nextVotes = {
      ...store.votes,
      [provinceId]: {
        ...(store.votes[provinceId] ?? {}),
        [teamId]: ((store.votes[provinceId] ?? {})[teamId] ?? 0) + 1,
      },
    };

    const nextStore: FootballMapStore = {
      votes: nextVotes,
      nextVoteAt: new Date(now + VOTE_COOLDOWN_MS).toISOString(),
    };

    setStore(nextStore);
    saveStore(nextStore);
    return { ok: true };
  };

  return {
    standings,
    nextVoteAt: store.nextVoteAt,
    vote,
  };
}
