// SDK 타입은 이 어댑터에만 한정합니다. 도메인 좌표는 Kakao에 의존하지 않습니다.
type LatLng = object;
type MapInstance = { setBounds(bounds: object): void; panTo(point: LatLng): void; relayout(): void };
type Overlay = { setMap(map: MapInstance | null): void };
type Marker = Overlay & { setPosition(point: LatLng): void };
type Polyline = Overlay & { setPath(path: LatLng[]): void };
export type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => { extend(point: LatLng): void };
  Map: new (container: HTMLElement, options: object) => MapInstance;
  Marker: new (options: object) => Marker;
  Polyline: new (options: object) => Polyline;
  CustomOverlay: new (options: object) => Marker;
};
declare global { interface Window { kakao?: { maps: KakaoMaps } } }
let pending: Promise<KakaoMaps> | null = null;
export function loadMapSdk(): Promise<KakaoMaps> {
  if (pending) return pending;
  const key = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim();
  if (!key) return Promise.reject(new Error('지도 키가 설정되지 않았습니다. VITE_KAKAO_MAP_JAVASCRIPT_KEY를 확인해주세요.'));
  pending = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      reject(new Error('지도를 불러오지 못했습니다. 네트워크, JavaScript 키와 등록 도메인을 확인해주세요.'));
    };
    const timer = window.setTimeout(fail, 20_000);
    const ready = () => {
      const maps = window.kakao?.maps;
      if (!maps) { fail(); return; }
      maps.load(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(maps);
      });
    };
    if (window.kakao?.maps) { ready(); return; }
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
