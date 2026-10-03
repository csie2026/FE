import { api } from '../../../api.ts';
import type { HikingCourse } from '../types';

export type MountainOption = {
  id: number;
  name: string;
  city: string;
  height: number;
  lat: number;
  lng: number;
  courseCount: number;
};
export type CourseOption = {
  id: number;
  mountainId: number;
  name: string;
  startName: string;
  startLat: number;
  startLng: number;
  lengthKm: number;
  upMin: number;
  downMin: number;
  difficulty: 'EASY' | 'NORMAL' | 'HARD';
  risk: string | null;
  source: 'FOREST' | 'OSM';
};
export type CourseDetail = { course: CourseOption; path: [number, number][] };
export const getMountains = () => api<MountainOption[]>('/api/mountains');
export const getCourses = (id: number) => api<CourseOption[]>(`/api/mountains/${id}/courses`);
export const getCourse = (id: number) => api<CourseDetail>(`/api/courses/${id}`);

// 선택한 산과 코스의 DB 관계를 확인하고 GeoJSON의 [경도, 위도]를 지도용 좌표 객체로 바꾼다.
// 문자열 ID로 변환해도 원래 산·코스 ID의 연결은 유지한다.
export function toHikingCourse(mountain: MountainOption, detail: CourseDetail): HikingCourse {
  if (
    detail.course.mountainId !== mountain.id ||
    detail.path.length < 2 ||
    detail.path.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  ) {
    throw new Error('코스 경로를 확인할 수 없습니다. 다른 코스를 선택해주세요.');
  }
  return {
    courseId: String(detail.course.id),
    mountainId: String(mountain.id),
    courseName: detail.course.name,
    mountainName: mountain.name,
    startPoint: { lat: detail.course.startLat, lng: detail.course.startLng },
    summitPoint: { lat: mountain.lat, lng: mountain.lng },
    path: detail.path.map(([lng, lat]) => ({ lat, lng })),
  };
}
