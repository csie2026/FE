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
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
};
export type HikingState = 'READY' | 'TRACKING' | 'PAUSED' | 'COMPLETED';
export type LocationStatus = 'IDLE' | 'REQUESTING' | 'AVAILABLE' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';
