import { PROVINCES } from "@/data/provinces";

export type FootballTeam = {
  id: string;
  cityId: string;
  cityName: string;
  name: string;
  color: string;
};

const TEAM_COLORS = [
  "#0EA5E9",
  "#E11D48",
  "#16A34A",
  "#F59E0B",
  "#7C3AED",
  "#2563EB",
  "#DC2626",
  "#0891B2",
  "#EA580C",
  "#059669",
  "#9333EA",
  "#1D4ED8",
  "#BE123C",
  "#15803D",
  "#CA8A04",
  "#0F766E",
  "#B91C1C",
  "#4F46E5",
  "#0369A1",
  "#7E22CE",
] as const;

export const FOOTBALL_TEAMS: FootballTeam[] = PROVINCES.map((province, index) => ({
  id: `team-${province.id}`,
  cityId: province.id,
  cityName: province.name,
  name: `${province.name} SK`,
  color: TEAM_COLORS[index % TEAM_COLORS.length],
}));

export const FOOTBALL_TEAM_BY_ID: Record<string, FootballTeam> = Object.fromEntries(
  FOOTBALL_TEAMS.map((team) => [team.id, team]),
);

export const FOOTBALL_TEAM_IDS = FOOTBALL_TEAMS.map((team) => team.id);

export const FOOTBALL_NEUTRAL_COLOR = "#243044";

export function teamColor(teamId: string | null | undefined): string {
  if (!teamId) return FOOTBALL_NEUTRAL_COLOR;
  return FOOTBALL_TEAM_BY_ID[teamId]?.color ?? FOOTBALL_NEUTRAL_COLOR;
}

export function teamName(teamId: string | null | undefined): string {
  if (!teamId) return "Bilinmiyor";
  return FOOTBALL_TEAM_BY_ID[teamId]?.name ?? "Bilinmiyor";
}
