import { getBookshelfSnapshot } from "@/lib/weread";
import {
  enforceRateLimit,
  enforceSameOrigin,
  errorJson,
  getWereadSkillKeyFromRequest,
  privateJson
} from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request, "weread-summary", 20, 60_000);
    const skillKey = getWereadSkillKeyFromRequest(request);
    const shelf = await getBookshelfSnapshot(skillKey);
    const ebookCount = shelf.books.filter((book) => book.mediaType === "电子书").length;
    const audioCount = shelf.books.filter((book) => book.mediaType === "有声书").length;

    return privateJson({
      ok: true,
      total: shelf.total,
      ebooks: ebookCount,
      audiobooks: audioCount
    });
  } catch (error) {
    return errorJson(error, "读取微信读书数据失败。");
  }
}
