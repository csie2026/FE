export type Mountain = {
  id: string
  name: string
  height: string
  distance: string
  difficulty: '쉬움' | '보통' | '어려움'
}

export type City = { id: string; name: string; mountains: Mountain[] }
export type Region = { id: string; name: string; cities: City[] }

// 권역/시·군 분류: reference/경기도 권역.jpg (5 + 7 + 8 + 11 = 31).
// 산 이름, 높이, 코스 거리, 난이도는 UI 검증용 mock이며 실제 산행 정보가 아니다.
function city(name: string, mountainNames: string[]): City {
  return {
    id: name,
    name,
    mountains: mountainNames.map((mountainName, index) => ({
      id: `${name}-${index}`,
      name: mountainName,
      height: index === 0 ? '320m' : '610m',
      distance: index === 0 ? '2.1km' : '3.8km',
      difficulty: index === 0 ? '쉬움' : '보통',
    })),
  }
}

// API 도입 시 이 데이터 공급 부분을 교체하고 Region → City → Mountain 형태를 유지한다.
export const regions: Region[] = [
  { id: 'south', name: '남부권역', cities: [
    city('용인시', ['석성산', '광교산']), city('평택시', ['부락산']),
    city('이천시', ['설봉산']), city('안성시', ['서운산']), city('여주시', ['황학산']),
  ] },
  { id: 'east', name: '동부권역', cities: [
    city('성남시', ['불곡산']), city('남양주시', ['운길산', '축령산']),
    city('광주시', ['태화산']), city('하남시', ['검단산']), city('구리시', ['아차산']),
    city('양평군', ['용문산']), city('가평군', ['명지산']),
  ] },
  { id: 'north', name: '북부권역', cities: [
    city('고양시', ['북한산', '고봉산']), city('의정부시', ['사패산']),
    city('파주시', ['감악산']), city('김포시', ['문수산']), city('양주시', ['불곡산']),
    city('포천시', ['명성산']), city('동두천시', ['소요산']), city('연천군', ['고대산']),
  ] },
  { id: 'central', name: '중부권역', cities: [
    city('수원시', ['광교산']), city('부천시', ['원미산']), city('안산시', ['수리산']),
    city('화성시', ['무봉산']), city('안양시', ['관악산']), city('시흥시', ['소래산']),
    city('광명시', ['도덕산']), city('군포시', ['수리산']), city('오산시', ['필봉산']),
    city('의왕시', ['백운산']), city('과천시', ['청계산']),
  ] },
]
