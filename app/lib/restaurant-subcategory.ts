import type { NearbyRestaurant } from "../api/restaurants/route";

/** 세부 카테고리 통계에 쓸 샘플 크기(건) */
export const PROFILE_SAMPLE_SIZE = 100;

/** 노출할 세부 카테고리 칩 최대 개수 */
export const MAX_SUBCATEGORY_FILTERS = 10;

/** 첫 화면에 보여 줄 장소 개수(필터 적용 후) */
export const INITIAL_LIST_DISPLAY = 5;

/** 「더보기」 한 번에 추가로 펼칠 개수 */
export const LIST_LOAD_MORE_STEP = 15;

/**
 * 카카오 `category_name`(예: "음식점 > 한식 > 백반,가정식")에서
 * 대분류 다음 단계(예: "한식")를 세부 라벨로 씁니다.
 */
export function extractSubcategoryLabel(categoryName: string): string {
  const parts = categoryName
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[1];
  if (parts.length === 1) return parts[0];
  return "기타";
}

export function itemMatchesSubcategory(
  item: Pick<NearbyRestaurant, "categoryName">,
  subcategory: string,
): boolean {
  return extractSubcategoryLabel(item.categoryName) === subcategory;
}

/** 샘플에서 등장 빈도 상위 `max`개 세부 라벨 */
export function pickTopSubcategories(
  sample: Pick<NearbyRestaurant, "categoryName">[],
  max: number,
): string[] {
  const counts = new Map<string, number>();
  for (const r of sample) {
    const label = extractSubcategoryLabel(r.categoryName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([label]) => label);
}
