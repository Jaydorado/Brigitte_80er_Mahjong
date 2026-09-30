export type FaceId = number; // 0..33
// 0–8 dots 1–9 (Pin), 9–17 bamboo 1–9 (Sou), 18–26 characters 1–9 (Man),
// 27 East(Ton) 28 South(Nan) 29 West(Shaa) 30 North(Pei), 31 red(Chun) 32 green(Hatsu) 33 white(Haku)
export const FACE_COUNT = 34;

const SUITS = ['Pin', 'Sou', 'Man'] as const;
const HONORS = ['Ton', 'Nan', 'Shaa', 'Pei', 'Chun', 'Hatsu', 'Haku'] as const;
const WIND_CORNERS = ['O', 'S', 'W', 'N'] as const;

export function faceFile(f: FaceId): string {
  return f < 27 ? `${SUITS[Math.floor(f / 9)]}${f % 9 + 1}` : HONORS[f - 27];
}

export function faceCorner(f: FaceId): string {
  if (f < 27) return String(f % 9 + 1);
  return f < 31 ? WIND_CORNERS[f - 27] : '';
}
