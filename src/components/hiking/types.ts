export type Coordinate = { lat: number; lng: number };
export type HikingCourse = {
  courseId: string;
  mountainId: string;
  courseName: string;
  mountainName: string;
  startPoint: Coordinate;
  summitPoint: Coordinate;
  path: Coordinate[];
};
export type GpsPoint = Coordinate & {
  // 지도 좌표(lat/lng)와 서버 전송 좌표(latitude/longitude)를 같은 원본 표본에서 유지한다.
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
};
export type HikingState = 'READY' | 'TRACKING' | 'PAUSED' | 'COMPLETED';
// 위치 권한·수신 결과는 산행 진행 상태와 분리해 시작 가능 여부에만 반영한다.
export type LocationStatus =
  'IDLE' | 'REQUESTING' | 'AVAILABLE' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';
