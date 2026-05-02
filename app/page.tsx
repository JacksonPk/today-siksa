"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getNearbyRestaurants,
  openKakaoMapWalkingRoute,
} from "./lib/restaurants";
import {
  INITIAL_LIST_DISPLAY,
  itemMatchesSubcategory,
  LIST_LOAD_MORE_STEP,
  MAX_SUBCATEGORY_FILTERS,
  pickTopSubcategories,
  PROFILE_SAMPLE_SIZE,
} from "./lib/restaurant-subcategory";
import {
  WALK_MINUTES_OPTIONS,
  walkMinutesToRadiusMeters,
  type WalkMinutesOption,
} from "./lib/walking-radius";

type Coords = { lat: number; lng: number };
type GeoPermissionState = "granted" | "denied" | "prompt" | "unknown";

/** 모바일에서 전화 앱을 열기 위한 tel: URI. 번호가 없으면 null. */
function phoneNumberToTelHref(phone: string): string | null {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!normalized || normalized === "+") return null;
  return `tel:${normalized}`;
}

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isRequestingGeo, setIsRequestingGeo] = useState(false);
  const [geoPermission, setGeoPermission] =
    useState<GeoPermissionState>("unknown");
  const [debugInfo, setDebugInfo] = useState<string>("");

  /** 마지막으로 카카오에 요청한 페이지 번호 */
  const [apiPage, setApiPage] = useState(1);
  const [apiIsEnd, setApiIsEnd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** 세부 카테고리 필터 적용 후, 화면에 펼쳐 둔 개수 */
  const [visibleCount, setVisibleCount] = useState(INITIAL_LIST_DISPLAY);
  const [walkMinutes, setWalkMinutes] = useState<WalkMinutesOption>(10);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof getNearbyRestaurants>>["restaurants"]
  >([]);
  const [subcategoryChips, setSubcategoryChips] = useState<string[]>([]);
  /** null = 전체(필터 없음) */
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [isProfiling, setIsProfiling] = useState(false);

  const radiusMeters = useMemo(
    () => walkMinutesToRadiusMeters(walkMinutes),
    [walkMinutes],
  );

  const filteredItems = useMemo(() => {
    if (selectedSubcategory == null) return items;
    return items.filter((r) => itemMatchesSubcategory(r, selectedSubcategory));
  }, [items, selectedSubcategory]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );

  const canLoadMore = useMemo(
    () =>
      !!coords &&
      !isLoading &&
      !isProfiling &&
      (visibleCount < filteredItems.length || !apiIsEnd),
    [coords, isLoading, isProfiling, visibleCount, filteredItems.length, apiIsEnd],
  );

  function applySubcategorySelection(next: string | null) {
    setSelectedSubcategory(next);
    const filtered =
      next == null
        ? items
        : items.filter((r) => itemMatchesSubcategory(r, next));
    setVisibleCount(
      Math.min(INITIAL_LIST_DISPLAY, Math.max(filtered.length, 0)),
    );
  }

  useEffect(() => {
    const protocol =
      typeof window !== "undefined" ? window.location.protocol : "";
    const secure =
      typeof window !== "undefined"
        ? String(window.isSecureContext)
        : "unknown";

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const hasGeo = typeof navigator !== "undefined" && !!navigator.geolocation;
    const hasPerm =
      typeof navigator !== "undefined" && "permissions" in navigator;

    setDebugInfo(
      `protocol=${protocol} secureContext=${secure} hasGeo=${String(hasGeo)} hasPermissionsApi=${String(hasPerm)} ua=${ua}`,
    );

    // iOS Safari may not support navigator.permissions for geolocation.
    const nav = navigator as unknown as {
      permissions?: {
        query?: (desc: { name: string }) => Promise<{ state: string }>;
      };
    };

    nav.permissions
      ?.query?.({ name: "geolocation" })
      .then((p) => {
        const state = p.state as GeoPermissionState;
        setGeoPermission(state ?? "unknown");
      })
      .catch(() => {
        setGeoPermission("unknown");
      });
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoError("이 브라우저는 위치 권한을 지원하지 않습니다.");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGeoError(
        "iPhone/Safari에서는 HTTPS에서만 위치 권한이 동작합니다. (예: https://… 로 접속하거나, 로컬 테스트는 터널(ngrok/Cloudflare Tunnel) 사용)",
      );
      return;
    }

    setIsRequestingGeo(true);
    setGeoError(null);

    let finished = false;
    let watchId: number | null = null;

    const done = (next?: { coords?: Coords; error?: string }) => {
      if (finished) return;
      finished = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (next?.coords) setCoords(next.coords);
      if (next?.error) setGeoError(next.error);
      setIsRequestingGeo(false);
    };

    // iOS Safari sometimes hangs on getCurrentPosition; we fall back to watchPosition.
    const startWatchFallback = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          done({
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
        },
        (err) => {
          done({
            error:
              err.code === err.PERMISSION_DENIED
                ? "위치 권한이 거부되었습니다. iPhone 설정 또는 Safari 사이트 설정에서 위치 권한을 허용해주세요."
                : err.code === err.POSITION_UNAVAILABLE
                  ? "위치 정보를 사용할 수 없습니다. (GPS/네트워크 상태 확인)"
                  : err.code === err.TIMEOUT
                    ? "위치 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요."
                    : `현재 위치를 가져오지 못했습니다. (code: ${err.code})`,
          });
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 },
      );
    };

    const watchFallbackTimer = window.setTimeout(() => {
      startWatchFallback();
    }, 2500);

    const hangGuard = window.setTimeout(() => {
      if (finished) return;
      startWatchFallback();
      window.setTimeout(() => {
        if (!finished) {
          done({
            error:
              "위치 권한 요청이 응답되지 않습니다. iPhone 설정 > 개인정보 보호 및 보안 > 위치 서비스, 그리고 Safari의 사이트 위치 권한을 확인해주세요.",
          });
        }
      }, 9000);
    }, 12_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(watchFallbackTimer);
        window.clearTimeout(hangGuard);
        done({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      (err) => {
        window.clearTimeout(watchFallbackTimer);
        window.clearTimeout(hangGuard);
        done({
          error:
            err.code === err.PERMISSION_DENIED
              ? "위치 권한이 거부되었습니다. iPhone 설정 또는 Safari 사이트 설정에서 위치 권한을 허용해주세요."
              : err.code === err.POSITION_UNAVAILABLE
                ? "위치 정보를 사용할 수 없습니다. (GPS/네트워크 상태 확인)"
                : err.code === err.TIMEOUT
                  ? "위치 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요."
                  : `현재 위치를 가져오지 못했습니다. (code: ${err.code})`,
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!coords) return;
      setIsProfiling(true);
      setIsLoading(true);
      setGeoError(null);
      setSelectedSubcategory(null);
      setSubcategoryChips([]);
      setVisibleCount(INITIAL_LIST_DISPLAY);
      try {
        const merged: Awaited<
          ReturnType<typeof getNearbyRestaurants>
        >["restaurants"] = [];
        const seen = new Set<string>();
        let p = 1;
        let lastIsEnd = false;

        while (merged.length < PROFILE_SAMPLE_SIZE && p <= 45 && !cancelled) {
          const result = await getNearbyRestaurants({
            x: coords.lng,
            y: coords.lat,
            page: p,
            radiusMeters,
          });
          if (cancelled) return;
          for (const r of result.restaurants) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              merged.push(r);
            }
          }
          lastIsEnd = result.isEnd;
          if (result.isEnd) break;
          p += 1;
        }

        if (cancelled) return;
        merged.sort((a, b) => {
          const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
          const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
        setItems(merged);
        setApiPage(p);
        setApiIsEnd(lastIsEnd);
        setVisibleCount(
          Math.min(INITIAL_LIST_DISPLAY, Math.max(merged.length, 0)),
        );
        const sample = merged.slice(0, PROFILE_SAMPLE_SIZE);
        setSubcategoryChips(
          pickTopSubcategories(sample, MAX_SUBCATEGORY_FILTERS),
        );
      } catch (e) {
        if (cancelled) return;
        setGeoError(
          e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.",
        );
        setItems([]);
        setApiPage(1);
        setApiIsEnd(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsProfiling(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [coords, radiusMeters]);

  async function loadMore() {
    if (!coords) return;
    if (isLoading || isProfiling) return;

    const filteredNow =
      selectedSubcategory == null
        ? items
        : items.filter((r) => itemMatchesSubcategory(r, selectedSubcategory));

    if (visibleCount < filteredNow.length) {
      setVisibleCount((c) =>
        Math.min(c + LIST_LOAD_MORE_STEP, filteredNow.length),
      );
      return;
    }

    if (apiIsEnd) return;

    setIsLoading(true);
    try {
      const result = await getNearbyRestaurants({
        x: coords.lng,
        y: coords.lat,
        page: apiPage + 1,
        radiusMeters,
      });
      let merged: typeof items = [];
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const next = [...prev];
        for (const r of result.restaurants) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            next.push(r);
          }
        }
        next.sort((a, b) => {
          const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
          const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
        merged = next;
        return next;
      });
      setApiPage(result.page);
      setApiIsEnd(result.isEnd);
      const filteredAfter =
        selectedSubcategory == null
          ? merged
          : merged.filter((r) => itemMatchesSubcategory(r, selectedSubcategory));
      setVisibleCount((c) =>
        Math.min(c + LIST_LOAD_MORE_STEP, filteredAfter.length),
      );
    } catch (e) {
      setGeoError(
        e instanceof Error ? e.message : "더보기를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-zinc-50 px-6 py-10 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="w-full max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">오늘의 식사</h1>
          {/* <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            현재 위치 기준 도보 약 {walkMinutes}분(반경 약 {radiusMeters}m) 안
            음식점(FD6)을 거리순으로 보여줍니다. 세부 카테고리(한식·일식 등) 칩은
            최대 약 {PROFILE_SAMPLE_SIZE}건 샘플에서 빈도 상위{" "}
            {MAX_SUBCATEGORY_FILTERS}개만 골랐습니다. 보행 속도는 시속 5km(1km당
            12분)으로 가정했습니다.
          </p> */}
        </header>

        {coords && !geoError ? (
          <section
            className="mb-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            aria-label="검색 조건"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                도보 시간
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {WALK_MINUTES_OPTIONS.map((m) => {
                  const active = walkMinutes === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWalkMinutes(m)}
                      className={
                        active
                          ? "inline-flex h-9 items-center rounded-full bg-zinc-900 px-3 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "inline-flex h-9 items-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900/50"
                      }
                    >
                      도보 {m}분
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                세부 카테고리
              </div>
              {/* <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                카카오 응답의 업종 문자열에서 추출한 상위 항목입니다. 「전체」는
                지금까지 불러온 목록을 필터 없이 보여줍니다.
              </p> */}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySubcategorySelection(null)}
                  className={
                    selectedSubcategory == null
                      ? "inline-flex h-8 items-center rounded-full bg-emerald-600 px-2.5 text-xs font-semibold text-white"
                      : "inline-flex h-8 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
                  }
                >
                  전체
                </button>
                {subcategoryChips.map((label) => {
                  const active = selectedSubcategory === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => applySubcategorySelection(label)}
                      className={
                        active
                          ? "inline-flex h-8 items-center rounded-full bg-emerald-600 px-2.5 text-xs font-semibold text-white"
                          : "inline-flex h-8 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {isProfiling ? (
                <p className="mt-2 text-xs text-zinc-500">
                  주변 음식점을 모아 세부 카테고리를 정하는 중…
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {!coords && !geoError && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {isRequestingGeo
              ? "위치 권한을 요청 중입니다…"
              : "위치를 불러오는 중입니다…"}
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
              {debugInfo} permission={geoPermission}
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/40"
                onClick={requestLocation}
                disabled={isRequestingGeo}
              >
                {isRequestingGeo ? "요청 중…" : "버튼으로 위치 요청"}
              </button>
            </div>
          </div>
        )}

        {geoError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
            <div className="text-sm text-red-800 dark:text-red-200">
              {geoError}
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                onClick={requestLocation}
                disabled={isRequestingGeo}
              >
                {isRequestingGeo ? "요청 중…" : "위치 권한 다시 요청"}
              </button>
            </div>
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {filteredItems.length === 0 && items.length > 0 ? (
            <li className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              이 세부 카테고리에 해당하는 장소가 현재 목록에 없습니다.
              「전체」로 보거나 다른 칩을 선택해 보세요.
            </li>
          ) : null}
          {visibleItems.map((r) => {
            const telHref = phoneNumberToTelHref(r.phone);
            return (
              <li key={r.id}>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  {/* 이미지 플레이스홀더 비활성화 (로컬 API 썸네일 미제공)
                <div
                  className="mr-3 flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-center text-[11px] font-medium leading-snug text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400"
                  title="카카오 로컬 API 응답에 이미지 URL이 없음"
                >
                  이미지
                  <span className="mt-0.5 block px-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                    API 미제공
                  </span>
                </div>
                */}
                  <div className="min-w-0">
                    <div className="text-base font-semibold leading-snug">
                      {r.name}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {r.roadAddressName || r.addressName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                      {r.categoryGroupName
                        ? `${r.categoryGroupName} · ${r.categoryName}`
                        : r.categoryName}
                      {typeof r.distanceMeters === "number"
                        ? ` · ${r.distanceMeters}m`
                        : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                        title="별점은 로컬 API 응답에 없음"
                      >
                        <span aria-hidden>★</span>
                        <span>맵 상세에서 확인</span>
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500">
                        ·
                      </span>
                      <span title="리뷰 텍스트는 로컬 API 응답에 없음">
                        리뷰는 맵 상세
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        onClick={() => {
                          if (!coords) return;
                          openKakaoMapWalkingRoute({
                            start: { lat: coords.lat, lng: coords.lng },
                            end: { lat: r.y, lng: r.x },
                          });
                        }}
                        disabled={!coords}
                      >
                        도보 길찾기
                      </button>
                      {telHref ? (
                        <a
                          href={telHref}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          aria-label={`${r.name}에 전화 걸기`}
                        >
                          전화하기
                        </a>
                      ) : null}
                      <a
                        href={r.placeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        맵 상세·별점·리뷰
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/40"
            onClick={loadMore}
            disabled={!canLoadMore}
          >
            {isLoading ? "불러오는 중…" : "다른 맛집 더보기"}
          </button>
          <div className="text-xs text-zinc-500 dark:text-zinc-500">
            {coords && items.length > 0
              ? `표시 ${visibleItems.length} / 이 필터 ${filteredItems.length}곳 · 불러온 전체 ${items.length}곳${apiIsEnd ? " (끝)" : ""}`
              : ""}
          </div>
        </div>
      </main>
    </div>
  );
}
