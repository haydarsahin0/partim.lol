import { useMemo, useState } from "react";
import type { ProvinceStanding } from "@/backend/types";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import {
  FOOTBALL_TEAMS,
  FOOTBALL_TEAM_BY_ID,
  setCustomClubs,
  type FootballTeam,
} from "@/data/footballTeams";
import { VOTE_COOLDOWN_MS } from "@/lib/game";

type FootballMapStore = {
  votes: Record<string, Record<string, number>>;
  nextVoteAt: string | null;
  /** Kullanıcının kurduğu kulüpler (localStorage'da, demo moddaki parti gibi) */
  clubs: FootballTeam[];
};

const STORAGE_KEY = "partim.lol/football-map/v1";

function emptyStore(): FootballMapStore {
  return { votes: {}, nextVoteAt: null, clubs: [] };
}

function loadStore(): FootballMapStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as FootballMapStore;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const clubs = Array.isArray(parsed.clubs) ? parsed.clubs : [];
    // Kulüpleri canlı dizine geri yaz: pusula ve sonuçlar buradan okur.
    if (clubs.length > 0) setCustomClubs(clubs);
    return {
      votes: parsed.votes ?? {},
      nextVoteAt: parsed.nextVoteAt ?? null,
      clubs,
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
    if (!FOOTBALL_TEAM_BY_ID[teamId]) {
      return { ok: false, message: "Bilinmeyen takım." };
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
      clubs: store.clubs,
    };

    setStore(nextStore);
    saveStore(nextStore);
    return { ok: true };
  };

  /**
   * Futbol kulübü kurar. Parti kurmayla aynı mantık: ad, kısaltma, renk ve
   * isteğe bağlı logo. Demo modda anında kurulur, kulüp pusulaya girer.
   */
  const createClub = (input: {
    name: string;
    shortName: string;
    color: string;
    logoDataUrl?: string | null;
  }) => {
    const name = input.name.trim();
    const shortName = input.shortName.trim();
    if (name.length < 3) return { ok: false, message: "Kulüp adı en az 3 harf olmalı." };
    if (!shortName) return { ok: false, message: "Kısaltma gerekli." };
    if (FOOTBALL_TEAMS.some((t) => t.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
      return { ok: false, message: "Bu adla bir kulüp zaten var." };
    }

    const id = `club-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const club: FootballTeam = {
      id,
      name,
      shortName,
      fullName: name,
      color: input.color,
      on: "light",
      provinceId: "",
      cityId: "",
      cityName: "Türkiye geneli",
      blurb: "Kullanıcıların kurduğu kulüp.",
      custom: true,
      logoUrl: input.logoDataUrl ?? null,
      ownerHandle: null,
    };

    // Canlı dizine yaz: pusula ve sonuçlar buradan okur.
    setCustomClubs([club]);

    const nextStore: FootballMapStore = {
      votes: store.votes,
      nextVoteAt: store.nextVoteAt,
      clubs: [...store.clubs, club],
    };
    setStore(nextStore);
    saveStore(nextStore);
    return { ok: true, club };
  };

  /** Ülke geneli takım toplamları: oy sayısı ve yüzdesi (oy sırasına göre). */
  const national = useMemo(() => {
    const byTeam = new Map<string, number>();
    let total = 0;
    for (const province of PROVINCES) {
      const standing = standings[province.id];
      if (!standing) continue;
      total += standing.totalVotes;
      for (const tally of standing.tallies) {
        byTeam.set(tally.partyId, (byTeam.get(tally.partyId) ?? 0) + tally.votes);
      }
    }
    return [...byTeam.entries()]
      .map(([teamId, votes]) => ({
        teamId,
        votes,
        pct: total > 0 ? (votes / total) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes);
  }, [standings]);

  /** Oy pusulasında görünecek takımlar: 4 büyük en üstte, sonra kullanıcı kulüpleri, sonra alfabetik. */
  const ballotTeams = useMemo(() => {
    const sorted = [...FOOTBALL_TEAMS].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const majors = sorted.filter((t) => t.major);
    const rest = sorted.filter((t) => !t.major);
    return [...majors, ...rest];
  }, [store.clubs.length]);

  return {
    standings,
    nextVoteAt: store.nextVoteAt,
    vote,
    createClub,
    national,
    totalVotes: national.reduce((sum, row) => sum + row.votes, 0),
    clubs: store.clubs,
    ballotTeams,
  };
}
