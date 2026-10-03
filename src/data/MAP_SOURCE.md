# 경기도 지도 경계 출처

- Source: [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps), KOSTAT 2013.
- Original: [skorea_municipalities_geo_simple.json](https://github.com/southkorea/southkorea-maps/blob/master/kostat/2013/json/skorea_municipalities_geo_simple.json).
- The source repository describes KOSTAT data as “Free to share or remix.”
- `gyeonggi-boundaries.geojson` contains only the 44 source district features whose codes start with `31`. Original geometry coordinates are preserved. City names are mapped from the stable code prefixes because the source Korean name strings are malformed.
- `gyeonggiMap.ts` projects these coordinates into a 400×400 SVG. District polygons are grouped into the reference image's 31 cities/counties. Shared intra-city edges are omitted from outlines. Geography is not hand-drawn.
- Region membership comes exclusively from `reference/경기도 권역.jpg`, not the boundary dataset.
- This is a **simplified 2013 boundary dataset**, suitable for the frontend draft, not a current precision administrative map. Before production, replace the source with approved current 31-city SVG/GeoJSON/TopoJSON data and verify the city code/name mapping.
- Regenerate locally: `python scripts/generate-gyeonggi-map.py` (Python standard library only).
- Label callouts are presentation coordinates and do not modify administrative boundaries.
