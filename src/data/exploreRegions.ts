export type Mountain = {
  id: string;
  name: string;
  height: string;
  distance: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  courseCount: number;
};

export type City = { id: string; name: string; mountains: Mountain[] };
export type Region = { id: string; name: string; cities: City[] };

// 권역·시군 구조만 유지한다. 산 정보는 BE API에서 채운다.
function city(name: string): City {
  return { id: name, name, mountains: [] };
}

// 기존 지도와 시·군 필터가 사용하는 4개 권역, 31개 시·군 분류.
export const regions: Region[] = [
  {
    id: 'south',
    name: '남부권역',
    cities: [city('용인시'), city('평택시'), city('이천시'), city('안성시'), city('여주시')],
  },
  {
    id: 'east',
    name: '동부권역',
    cities: [
      city('성남시'),
      city('남양주시'),
      city('광주시'),
      city('하남시'),
      city('구리시'),
      city('양평군'),
      city('가평군'),
    ],
  },
  {
    id: 'north',
    name: '북부권역',
    cities: [
      city('고양시'),
      city('의정부시'),
      city('파주시'),
      city('김포시'),
      city('양주시'),
      city('포천시'),
      city('동두천시'),
      city('연천군'),
    ],
  },
  {
    id: 'central',
    name: '중부권역',
    cities: [
      city('수원시'),
      city('부천시'),
      city('안산시'),
      city('화성시'),
      city('안양시'),
      city('시흥시'),
      city('광명시'),
      city('군포시'),
      city('오산시'),
      city('의왕시'),
      city('과천시'),
    ],
  },
];
