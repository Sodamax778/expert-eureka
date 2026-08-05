import { callWereadGatewayWithKey, wereadSkillVersion } from "@/lib/weread";
import {
  enforceRateLimit,
  enforceSameOrigin,
  errorJson,
  getWereadSkillKeyFromRequest,
  privateJson
} from "@/lib/request-security";

type ShelfSync = {
  books?: unknown[];
  albums?: unknown[];
  mp?: unknown;
};

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request, "weread-activate", 12, 60_000);
    const skillKey = getWereadSkillKeyFromRequest(request);
    const shelf = await callWereadGatewayWithKey<ShelfSync>(skillKey, "/shelf/sync");
    const ebooks = shelf.books?.length || 0;
    const audiobooks = shelf.albums?.length || 0;

    return privateJson({
      ok: true,
      message: `Skill 已装载，当前按 skill_version ${wereadSkillVersion} 调用。Key 仅保存在当前浏览器。`,
      summary: {
        total: ebooks + audiobooks + (shelf.mp ? 1 : 0),
        ebooks,
        audiobooks
      }
    });
  } catch (error) {
    return errorJson(error, "微信读书 Skill 激活失败，请检查 Key。");
  }
}
