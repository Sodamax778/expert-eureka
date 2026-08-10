export type WereadSnapshot = {
  month: string;
  year: string;
  readingDays: number;
  readingMinutes: number;
  bookCount: number;
  noteCount: number;
  topBooks: string[];
  topBookDetails: Array<{
    bookId?: string;
    title: string;
    author: string;
    origin?: string;
    summary?: string;
    readingMinutes?: number;
    progress?: number;
  }>;
  quote: string;
  dailyReading: Array<{
    day: number;
    readingMinutes: number;
    readingSeconds?: number;
    books?: string[];
  }>;
};

export function getMockWereadSnapshot(): WereadSnapshot {
  return {
    month: "2026-07",
    year: "2026",
    readingDays: 18,
    readingMinutes: 1260,
    bookCount: 7,
    noteCount: 42,
    topBooks: ["置身事内", "可能性的艺术", "纳瓦尔宝典", "都柏林人", "不朽"],
    topBookDetails: [
      { title: "置身事内", author: "兰小欢", origin: "中国", summary: "理解政府与经济运行，重新看见我们身处的现实。", readingMinutes: 126, progress: 72 },
      { title: "可能性的艺术", author: "刘瑜", origin: "中国", summary: "从比较政治的视角，辨认制度与社会的多种可能。", readingMinutes: 94, progress: 46 },
      { title: "纳瓦尔宝典", author: "埃里克·乔根森", origin: "美国", summary: "关于财富、判断与幸福的长期思考。", readingMinutes: 81, progress: 64 },
      { title: "都柏林人", author: "詹姆斯·乔伊斯", origin: "爱尔兰", summary: "在日常生活的微光中，看见城市与人的停滞和觉醒。", readingMinutes: 73, progress: 38 },
      { title: "不朽", author: "米兰·昆德拉", origin: "捷克", summary: "个体、记忆与不朽相互纠缠，生活在叙述中展开。", readingMinutes: 69, progress: 55 }
    ],
    quote: "读书不是逃离现实，而是替现实打开另一扇窗。",
    dailyReading: [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 25, 26, 27].map((day, index) => ({
      day,
      readingMinutes: 28 + ((index * 17) % 73)
    }))
  };
}
