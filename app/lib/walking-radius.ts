/**
 * 도보 거리를 반경(미터)으로 환산합니다.
 * 시속 약 5km(1km당 12분)을 일반적인 보행 속도로 둡니다.
 */
export const WALK_MINUTES_OPTIONS = [5, 10, 20] as const;
export type WalkMinutesOption = (typeof WALK_MINUTES_OPTIONS)[number];

const MINUTES_PER_KM = 12;

export function walkMinutesToRadiusMeters(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(1, Math.round((minutes / MINUTES_PER_KM) * 1000));
}
