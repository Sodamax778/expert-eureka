import type { WereadSnapshot } from "./mock-weread";

const WASTE_LAND = "我在废土世界扫垃圾";
const BORED = "她对此感到厌烦";
const COSMETICS = "脂粉帝国";
const CONSUMERISM = "工作、消费主义和新穷人";
const FERTILITY = "生育制度";

const scheduledBooks = new Map<number, string[]>([
  ...[1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19].map(
    (day) => [day, [WASTE_LAND]] as [number, string[]]
  ),
  ...[21, 22, 23].map((day) => [day, [BORED]] as [number, string[]])
]);

scheduledBooks.get(5)?.push(COSMETICS);
scheduledBooks.get(11)?.push(CONSUMERISM);
scheduledBooks.get(18)?.push(FERTILITY);
scheduledBooks.get(19)?.push(FERTILITY);

const readingMinutes = new Map<number, number>([
  [1, 42],
  [2, 55],
  [3, 68],
  [4, 46],
  [5, 92],
  [9, 38],
  [10, 51],
  [11, 84],
  [12, 47],
  [13, 63],
  [14, 58],
  [15, 71],
  [16, 44],
  [18, 86],
  [19, 79],
  [21, 49],
  [22, 57],
  [23, 66]
]);

// 文石真实接口尚未确定时的独立模拟快照。字段形状与平台无关，便于后续无缝替换适配器。
export function getMockBooxSnapshot(): WereadSnapshot {
  const dailyReading = Array.from(scheduledBooks.entries())
    .sort(([dayA], [dayB]) => dayA - dayB)
    .map(([day, books]) => ({
      day,
      books,
      readingMinutes: readingMinutes.get(day) || 45
    }));

  return {
    month: "2026-07",
    year: "2026",
    readingDays: dailyReading.length,
    readingMinutes: dailyReading.reduce((total, item) => total + item.readingMinutes, 0),
    bookCount: 5,
    noteCount: 18,
    topBooks: [WASTE_LAND, BORED, COSMETICS, CONSUMERISM, FERTILITY],
    topBookDetails: [
      { title: WASTE_LAND, author: "模拟作者", origin: "模拟数据", summary: "本月主要阅读书目。" },
      { title: BORED, author: "模拟作者", origin: "模拟数据", summary: "本月阅读书目。" },
      { title: COSMETICS, author: "模拟作者", origin: "模拟数据", summary: "本月单日阅读书目。" },
      { title: CONSUMERISM, author: "齐格蒙特·鲍曼", origin: "模拟数据", summary: "本月单日阅读书目。" },
      { title: FERTILITY, author: "费孝通", origin: "模拟数据", summary: "本月阅读书目。" }
    ],
    quote: "阅读让日常生活里多出一条可以缓慢行走的路。",
    dailyReading
  };
}
