import type { NearbyRestaurant } from "../api/restaurants/route";

export type GetNearbyRestaurantsParams = {
  x: number; // longitude
  y: number; // latitude
  page?: number; // 1..45
};

export type GetNearbyRestaurantsResult = {
  page: number;
  isEnd: boolean;
  restaurants: NearbyRestaurant[];
};

export async function getNearbyRestaurants(
  params: GetNearbyRestaurantsParams,
): Promise<GetNearbyRestaurantsResult> {
  const url = new URL("/api/restaurants", window.location.origin);
  url.searchParams.set("x", String(params.x));
  url.searchParams.set("y", String(params.y));
  url.searchParams.set("page", String(params.page ?? 1));

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch restaurants (${res.status}): ${text}`);
  }
  return (await res.json()) as GetNearbyRestaurantsResult;
}

export type OpenWalkingRouteParams = {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
};

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function openKakaoMapWalkingRoute({ start, end }: OpenWalkingRouteParams) {
  const sp = `${start.lat},${start.lng}`;
  const ep = `${end.lat},${end.lng}`;

  // KakaoMap URL scheme docs:
  // - App: kakaomap://route?sp=...&ep=...&by=foot
  // - MobileWeb fallback: http://m.map.kakao.com/scheme/route?sp=...&ep=...&by=foot
  const appUrl = `kakaomap://route?sp=${encodeURIComponent(sp)}&ep=${encodeURIComponent(ep)}&by=foot`;
  const webUrl = `http://m.map.kakao.com/scheme/route?sp=${encodeURIComponent(sp)}&ep=${encodeURIComponent(ep)}&by=foot`;

  if (!isMobile()) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const startTime = Date.now();
  window.location.href = appUrl;

  // If app isn't installed, fall back to mobile web.
  setTimeout(() => {
    if (Date.now() - startTime < 1400) {
      window.location.href = webUrl;
    }
  }, 1100);
}

