import type { HikingCourse } from '../types';

// 스마트폰 GPS 도보 테스트용 경로입니다. 실제 등산로 안내에 사용하지 않습니다.
// 부일로 703 → 부일로 693의 확인된 양 끝 좌표를 약 10m 간격으로 선형 보간했습니다.
export const testCourses: HikingCourse[] = [{
  courseId: 'test-buil-ro-walk-01',
  mountainId: 'test-buil-ro',
  courseName: 'GPS 도보 테스트 코스 · 부일로 703 → 693',
  mountainName: '부일로 GPS 테스트',
  startPoint: { lat: 37.48496, lng: 126.80812 },
  summitPoint: { lat: 37.4845495, lng: 126.8069919 },
  path: [
    { lat: 37.48496, lng: 126.80812 },
    { lat: 37.4849226818, lng: 126.8080174455 },
    { lat: 37.4848853636, lng: 126.8079148909 },
    { lat: 37.4848480455, lng: 126.8078123364 },
    { lat: 37.4848107273, lng: 126.8077097818 },
    { lat: 37.4847734091, lng: 126.8076072273 },
    { lat: 37.4847360909, lng: 126.8075046727 },
    { lat: 37.4846987727, lng: 126.8074021182 },
    { lat: 37.4846614545, lng: 126.8072995636 },
    { lat: 37.4846241364, lng: 126.8071970091 },
    { lat: 37.4845868182, lng: 126.8070944545 },
    { lat: 37.4845495, lng: 126.8069919 },
  ],
}];
