import type { WereadSnapshot } from "./mock-weread";

const WEREAD_GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.4";
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

// 微信读书 Skill 共用一个网关，具体能力由请求体中的 api_name 区分。
// 平台版本变化应集中在本文件处理，不要让模板依赖网关原始字段。

type GatewayBody = Record<string, unknown> & {
  api_name: string;
  skill_version: string;
};

type GatewayResponse = Record<string, unknown> & {
  errcode?: number;
  errmsg?: string;
  upgrade_info?: {
    message?: string;
  };
};

type ReadDataDetail = GatewayResponse & {
  baseTime?: number;
  readDays?: number;
  totalReadTime?: number;
  readTimes?: Record<string, number>;
  readStat?: Array<{
    stat?: string;
    counts?: string;
  }>;
  readLongest?: Array<{
    book?: {
      bookId?: string;
      title?: string;
      author?: string;
      cover?: string;
    };
    albumInfo?: {
      name?: string;
      authorName?: string;
      cover?: string;
    };
    readTime?: number;
  }>;
  dailyReadTimes?: Record<string, number>;
};

type ShelfSync = GatewayResponse & {
  books?: Array<{
    bookId?: string;
    title?: string;
    author?: string;
    cover?: string;
    readUpdateTime?: number;
    finishReading?: number;
  }>;
  albums?: Array<{
    albumInfo?: {
      name?: string;
      authorName?: string;
      cover?: string;
    };
  }>;
  mp?: unknown;
};

type UserNotebooks = GatewayResponse & {
  books?: Array<{
    bookId?: string;
    book?: {
      bookId?: string;
      title?: string;
      author?: string;
    };
  }>;
};

type BookmarkList = GatewayResponse & {
  updated?: Array<{
    markText?: string;
    createTime?: number;
    type?: number;
    chapterUid?: number;
  }>;
  chapters?: Array<{
    chapterUid?: number;
    chapterIdx?: number;
    title?: string;
  }>;
};

type MineReviewList = GatewayResponse & {
  reviews?: Array<{
    review?: {
      content?: string;
      abstract?: string;
      chapterUid?: number;
      chapterIdx?: number;
      chapterName?: string;
      createTime?: number;
    };
  }>;
};

type BookProgress = GatewayResponse & {
  book?: {
    chapterUid?: number;
    progress?: number;
    recordReadingTime?: number;
  };
};

type BookInfo = GatewayResponse & {
  title?: string;
  author?: string;
  cover?: string;
  intro?: string;
  category?: string;
};

const WEREAD_REQUEST_TIMEOUT_MS = 15_000;

export async function callWereadGatewayWithKey<T extends GatewayResponse>(
  apiKey: string,
  apiName: string,
  params: Record<string, unknown> = {}
) {
  if (!apiKey) {
    throw new Error("还没有保存微信读书 skillKey。");
  }

  const body: GatewayBody = {
    api_name: apiName,
    ...params,
    skill_version: SKILL_VERSION
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEREAD_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(WEREAD_GATEWAY, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("微信读书数据请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`微信读书 skill 调用失败：${response.status} ${detail}`);
  }

  const data = (await response.json()) as T;
  if (data.upgrade_info?.message) {
    throw new Error(`微信读书 skill 需要升级：${data.upgrade_info.message}`);
  }
  if (typeof data.errcode === "number" && data.errcode !== 0) {
    throw new Error(data.errmsg || `微信读书返回错误：${data.errcode}`);
  }

  return data;
}

export function isValidWereadSkillKey(skillKey: string) {
  return /^wrk-[A-Za-z0-9_-]{8,}$/.test(skillKey.trim());
}

function countFromReadStat(readStat: ReadDataDetail["readStat"], name: string) {
  const item = readStat?.find((stat) => stat.stat === name);
  const match = item?.counts?.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function secondsToMinutes(seconds: number | undefined) {
  return Math.round((seconds || 0) / 60);
}

function chinaDateParts(date: Date) {
  const localDate = new Date(date.getTime() + CHINA_TIME_OFFSET_MS);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate()
  };
}

function monthLabel() {
  const { year, month } = chinaDateParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}`;
}

function yearLabel() {
  return String(chinaDateParts(new Date()).year);
}

function timestampMilliseconds(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 0;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function currentChinaWeekStart() {
  const now = new Date();
  const chinaNow = new Date(now.getTime() + CHINA_TIME_OFFSET_MS);
  const weekday = chinaNow.getUTCDay() || 7;
  const chinaMidnight =
    Date.UTC(chinaNow.getUTCFullYear(), chinaNow.getUTCMonth(), chinaNow.getUTCDate()) -
    CHINA_TIME_OFFSET_MS;
  return chinaMidnight - (weekday - 1) * 24 * 60 * 60 * 1000;
}

function chinaWeekStartFromDateKey(value: string | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateOnly = Date.UTC(year, month - 1, day);
  const parsed = new Date(dateOnly);
  const isValidDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isValidDate || parsed.getUTCDay() !== 1) return undefined;
  return dateOnly - CHINA_TIME_OFFSET_MS;
}

function normalizeDailyReadTimes(dailyReadTimes: Record<string, number> | undefined, month: string) {
  // 兼容 Skill 可能返回的 YYYYMMDD、日号或秒/毫秒时间戳键。
  const monthPrefix = month.replace("-", "");
  return Object.entries(dailyReadTimes || {})
    .map(([rawDate, seconds]) => {
      const digits = rawDate.replace(/\D/g, "");
      let day = 0;
      if (digits.length >= 8 && digits.slice(0, 6) === monthPrefix) {
        day = Number(digits.slice(6, 8));
      } else if (/^\d{1,2}$/.test(rawDate)) {
        day = Number(rawDate);
      } else if (/^\d{10,13}$/.test(digits)) {
        const timestamp = Number(digits) * (digits.length === 10 ? 1000 : 1);
        const date = new Date(timestamp);
        if (!Number.isNaN(date.getTime())) {
          const chinaDate = chinaDateParts(date);
          const chinaMonth = `${chinaDate.year}-${String(chinaDate.month).padStart(2, "0")}`;
          if (chinaMonth === month) day = chinaDate.day;
        }
      }
      const readingSeconds = Math.max(0, Math.round(Number(seconds) || 0));
      return {
        day,
        readingSeconds,
        readingMinutes: secondsToMinutes(readingSeconds)
      };
    })
    .filter((item) => item.day >= 1 && item.day <= 31 && item.readingSeconds >= 60)
    .sort((a, b) => a.day - b.day);
}

async function getReadDataSnapshot(
  skillKey: string,
  mode: "weekly" | "monthly",
  requestedMonth?: string,
  requestedWeekStart?: string
): Promise<WereadSnapshot & { source: "weread" }> {
  const validRequestedMonth = requestedMonth && /^2026-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? requestedMonth
    : undefined;
  const selectedWeekStart =
    mode === "weekly" ? chinaWeekStartFromDateKey(requestedWeekStart) : undefined;
  const validRequestedWeek = selectedWeekStart !== undefined ? requestedWeekStart : undefined;
  const baseTimeMilliseconds = validRequestedMonth
    ? Date.UTC(
        Number(validRequestedMonth.slice(0, 4)),
        Number(validRequestedMonth.slice(5)) - 1,
        1
      ) - CHINA_TIME_OFFSET_MS
    : selectedWeekStart;
  const baseTime = baseTimeMilliseconds
    ? Math.floor(baseTimeMilliseconds / 1000)
    : undefined;
  const detail = await callWereadGatewayWithKey<ReadDataDetail>(skillKey, "/readdata/detail", {
    mode,
    ...(baseTime ? { baseTime } : {})
  });
  const snapshotMonth = validRequestedMonth || validRequestedWeek?.slice(0, 7) || monthLabel();

  const topBookDetails =
    detail.readLongest
      ?.map((item) => ({
        bookId: item.book?.bookId,
        title: item.book?.title || item.albumInfo?.name || "",
        author: item.book?.author || item.albumInfo?.authorName || "作者未知",
        readingMinutes: secondsToMinutes(item.readTime)
      }))
      .filter((book) => Boolean(book.title))
      .slice(0, 5) || [];
  const topBooks = topBookDetails.map((book) => book.title);

  return {
    month: snapshotMonth,
    year: snapshotMonth.slice(0, 4) || yearLabel(),
    readingDays: detail.readDays || countFromReadStat(detail.readStat, "阅读"),
    readingMinutes: secondsToMinutes(detail.totalReadTime),
    bookCount: countFromReadStat(detail.readStat, "读过") || topBooks.length,
    noteCount: countFromReadStat(detail.readStat, "笔记"),
    topBooks,
    topBookDetails,
    quote: mode === "weekly" ? "从这周读过的书里，挑一句话留给今天。" : "从这个月读过的书里，挑一句话留给今天。",
    dailyReading: normalizeDailyReadTimes(
      Object.keys(detail.readTimes || {}).length ? detail.readTimes : detail.dailyReadTimes,
      snapshotMonth
    ),
    source: "weread"
  };
}

export async function getMonthlyReceiptSnapshot(skillKey: string, requestedMonth?: string) {
  return getReadDataSnapshot(skillKey, "monthly", requestedMonth);
}

export async function getWeeklyReceiptSnapshot(skillKey: string, requestedWeekStart?: string) {
  const selectedWeekStart = chinaWeekStartFromDateKey(requestedWeekStart);
  const base = await getReadDataSnapshot(skillKey, "weekly", undefined, requestedWeekStart);
  const [shelf, notebooks] = await Promise.all([
    getBookshelfSnapshot(skillKey).catch(() => null),
    callWereadGatewayWithKey<UserNotebooks>(skillKey, "/user/notebooks", { count: 20 }).catch(() => null)
  ]);
  const recentBooks =
    shelf?.books
      .filter((book) => Boolean(book.bookId && book.title && book.readUpdateTime > 0))
      .map((book) => ({
        bookId: book.bookId,
        title: book.title,
        author: book.author || "作者未知",
        readUpdateTime: book.readUpdateTime
      })) || [];
  const notebookBooks =
    notebooks?.books
      ?.map((item) => ({
        bookId: item.bookId || item.book?.bookId || "",
        title: item.book?.title || "",
        author: item.book?.author || "作者未知"
      }))
      .filter((book) => Boolean(book.bookId && book.title))
      .slice(0, 20) || [];
  const weekStart = selectedWeekStart ?? currentChinaWeekStart();
  const periodEnd = Math.min(weekStart + 7 * 24 * 60 * 60 * 1000, Date.now() + 5 * 60 * 1000);
  const weeklyRecentBooks = recentBooks.filter((book) => {
    const updateTime = timestampMilliseconds(book.readUpdateTime);
    return updateTime >= weekStart && updateTime < periodEnd;
  });
  const seenTitles = new Set<string>();
  // Skill 周统计是自然周书目的权威来源；不足 5 本时才用该周更新、最近打开和最近笔记补足。
  const sourceBooks = [
    ...base.topBookDetails,
    ...weeklyRecentBooks,
    ...recentBooks,
    ...notebookBooks
  ]
    .filter((book) => {
      const key = book.title.trim().toLocaleLowerCase();
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 5);

  const topBookDetails = await Promise.all(
    sourceBooks.map(async (book) => {
      const match = base.topBookDetails.find(
        (item) => (item.bookId && item.bookId === book.bookId) || item.title === book.title
      );
      const [highlights, progress] = await Promise.all([
        book.bookId
          ? callWereadGatewayWithKey<BookmarkList>(skillKey, "/book/bookmarklist", { bookId: book.bookId }).catch(() => null)
          : Promise.resolve(null),
        book.bookId
          ? callWereadGatewayWithKey<BookProgress>(skillKey, "/book/getprogress", { bookId: book.bookId }).catch(() => null)
          : Promise.resolve(null)
      ]);
      const latestHighlight = [...(highlights?.updated || [])]
        .filter((item) => item.type === undefined || item.type === 1)
        .sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
        .find((item) => Boolean(item.markText?.trim()));
      return {
        ...book,
        // 数量列统一使用自然周口径；没有本周时长的补位书显示 0 分钟。
        readingMinutes: match?.readingMinutes ?? 0,
        progress: Math.max(0, Math.min(100, Math.round(progress?.book?.progress ?? match?.progress ?? 0))),
        summary: latestHighlight?.markText?.trim() || ""
      };
    })
  );

  return {
    ...base,
    topBooks: topBookDetails.map((book) => book.title),
    topBookDetails
  };
}

export async function getBookshelfSnapshot(skillKey: string) {
  const data = await callWereadGatewayWithKey<ShelfSync>(skillKey, "/shelf/sync");
  const books =
    data.books?.map((book) => ({
      bookId: book.bookId,
      title: book.title || "未命名书籍",
      author: book.author || "",
      coverUrl: book.cover || "",
      readUpdateTime: book.readUpdateTime || 0,
      finished: book.finishReading === 1,
      mediaType: "电子书"
    })) || [];
  const albums =
    data.albums?.map((album) => ({
      bookId: "",
      title: album.albumInfo?.name || "未命名有声书",
      author: album.albumInfo?.authorName || "",
      coverUrl: album.albumInfo?.cover || "",
      readUpdateTime: 0,
      finished: false,
      mediaType: "有声书"
    })) || [];
  return {
    books: [...books, ...albums].sort((a, b) => b.readUpdateTime - a.readUpdateTime),
    total: books.length + albums.length + (data.mp ? 1 : 0)
  };
}

export async function getReadingCardDetails(skillKey: string, bookId: string) {
  if (!bookId) return null;
  const [book, highlights, reviews, progress] = await Promise.all([
    callWereadGatewayWithKey<BookInfo>(skillKey, "/book/info", { bookId }),
    callWereadGatewayWithKey<BookmarkList>(skillKey, "/book/bookmarklist", { bookId }).catch(() => null),
    callWereadGatewayWithKey<MineReviewList>(skillKey, "/review/list/mine", { bookid: bookId, count: 20 }).catch(() => null),
    callWereadGatewayWithKey<BookProgress>(skillKey, "/book/getprogress", { bookId }).catch(() => null)
  ]);
  const chapterNames = new Map(
    (highlights?.chapters || [])
      .filter((chapter) => chapter.chapterUid !== undefined)
      .map((chapter) => [chapter.chapterUid as number, chapter.title?.trim() || ""])
  );
  const reviewNotes =
    reviews?.reviews
      ?.map((item) => item.review)
      .filter((review): review is NonNullable<typeof review> => Boolean(review?.content?.trim() || review?.abstract?.trim()))
      .map((review) => ({
        thought: review.content?.trim() || "",
        quote: review.abstract?.trim() || "",
        chapter:
          review.chapterName?.trim() ||
          (review.chapterUid !== undefined ? chapterNames.get(review.chapterUid) : "") ||
          (review.chapterIdx !== undefined ? `第 ${review.chapterIdx} 章` : ""),
        createTime: review.createTime || 0
      })) || [];
  const reviewQuotes = new Set(reviewNotes.map((note) => note.quote).filter(Boolean));
  const highlightNotes = [...(highlights?.updated || [])]
    .filter(
      (item) =>
        (item.type === undefined || item.type === 1) &&
        Boolean(item.markText?.trim()) &&
        !reviewQuotes.has(item.markText?.trim() || "")
    )
    .map((item) => ({
      thought: "",
      quote: item.markText?.trim() || "",
      chapter:
        item.chapterUid !== undefined ? chapterNames.get(item.chapterUid) || "" : "",
      createTime: item.createTime || 0
    }));
  const notes = [...reviewNotes, ...highlightNotes]
    .sort((a, b) => b.createTime - a.createTime)
    .slice(0, 2)
    .map(({ thought, quote, chapter }) => ({ thought, quote, chapter }));

  return {
    summary: book.intro?.trim() || "",
    category: book.category?.trim() || "",
    progress: Math.max(0, Math.min(100, Math.round(progress?.book?.progress || 0))),
    readingSeconds: Math.max(0, Math.round(progress?.book?.recordReadingTime || 0)),
    excerpt: notes[0]?.quote || "",
    notes
  };
}

export const wereadSkillVersion = SKILL_VERSION;
