# 경기도 행정구역 GeoJSON

`gyeonggi-si-gun.json`은 [kr-admin-geojson](https://github.com/KnellBalm/kr-admin-geojson) 저장소의 `sig.geojson`을 기반으로 경기도(`CTPRVN_CD: 41`) 피처만 추려 저장한 데이터입니다.

- 원본 좌표계: EPSG:4326
- 원본 경계 데이터: V-World 행정구역 경계 데이터(2023-07-29)
- 원본 단순화: 저장소에서 공개한 GeoJSON(`sig.geojson`, tolerance 0.0005°)
- 라이선스와 이용 조건: 원본 저장소의 README를 확인하세요. 출처 표기를 유지합니다.

지도 컴포넌트는 `d3-geo`의 Mercator 투영과 `fitSize`를 사용해 이 데이터를 SVG `500 × 550` 좌표계에 투영합니다. 선택 가능한 칩은 31개 시·군 기준이며, 원본 데이터의 일부 시는 구 단위 경계 피처로 나뉘어 렌더링됩니다.
