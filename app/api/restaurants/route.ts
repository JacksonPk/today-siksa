import { NextRequest } from "next/server";

/** 카카오 로컬 «카테고리로 장소 검색» — 음식점 그룹 */
const KAKAO_RESTAURANT_CATEGORY = "FD6";

type KakaoCategorySearchResponse = {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  documents: Array<{
    id: string;
    place_name: string;
    category_name: string;
    category_group_code?: string;
    category_group_name?: string;
    phone: string;
    address_name: string;
    road_address_name: string;
    x: string; // longitude
    y: string; // latitude
    place_url: string;
    distance?: string;
  }>;
};

export type NearbyRestaurant = {
  id: string;
  name: string;
  categoryName: string;
  categoryGroupCode?: string;
  categoryGroupName?: string;
  phone: string;
  addressName: string;
  roadAddressName: string;
  x: number; // longitude
  y: number; // latitude
  placeUrl: string;
  distanceMeters?: number;
};

function toNumber(value: string, fieldName: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${fieldName}`);
  return n;
}

export async function GET(req: NextRequest) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Missing KAKAO_REST_API_KEY" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const x = searchParams.get("x"); // longitude
  const y = searchParams.get("y"); // latitude
  const pageRaw = searchParams.get("page") ?? "1";
  const radiusRaw = searchParams.get("radius");

  if (!x || !y) {
    return Response.json(
      { error: "Missing required query params: x, y" },
      { status: 400 },
    );
  }

  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1 || page > 45) {
    return Response.json(
      { error: "Invalid page (1–45)" },
      { status: 400 },
    );
  }

  const radius = radiusRaw != null ? Number(radiusRaw) : 2000;
  if (!Number.isFinite(radius) || radius < 1 || radius > 20_000) {
    return Response.json(
      { error: "Invalid radius (1–20000 meters)" },
      { status: 400 },
    );
  }

  const size = 15;
  const kakaoUrl = new URL(
    "https://dapi.kakao.com/v2/local/search/category.json",
  );
  kakaoUrl.searchParams.set("category_group_code", KAKAO_RESTAURANT_CATEGORY);
  kakaoUrl.searchParams.set("x", x);
  kakaoUrl.searchParams.set("y", y);
  kakaoUrl.searchParams.set("radius", String(Math.round(radius)));
  kakaoUrl.searchParams.set("sort", "distance");
  kakaoUrl.searchParams.set("page", String(page));
  kakaoUrl.searchParams.set("size", String(size));

  try {
    const res = await fetch(kakaoUrl, {
      headers: {
        Authorization: `KakaoAK ${key}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { error: "Kakao Local API error", status: res.status, body: text },
        { status: 502 },
      );
    }

    const data = (await res.json()) as KakaoCategorySearchResponse;
    const restaurants: NearbyRestaurant[] = data.documents.map((d) => ({
      id: d.id,
      name: d.place_name,
      categoryName: d.category_name,
      categoryGroupCode: d.category_group_code,
      categoryGroupName: d.category_group_name,
      phone: d.phone,
      addressName: d.address_name,
      roadAddressName: d.road_address_name,
      x: toNumber(d.x, "x"),
      y: toNumber(d.y, "y"),
      placeUrl: d.place_url,
      distanceMeters: d.distance ? toNumber(d.distance, "distance") : undefined,
    }));

    return Response.json({
      page,
      isEnd: data.meta.is_end,
      restaurants,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "Kakao Local API error", detail: message },
      { status: 502 },
    );
  }
}
