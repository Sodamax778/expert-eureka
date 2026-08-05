export type TemplateKey =
  | "bookshelf_wall"
  | "cover_collage"
  | "weekly_receipt"
  | "reading_calendar"
  | "monthly_receipt"
  | "yearly_receipt"
  | "annotations_card"
  | "copywriting_wallpaper";

export type Template = {
  key: TemplateKey;
  name: string;
  summary: string;
  priority: string;
};

export const templates: Template[] = [
  {
    key: "bookshelf_wall",
    name: "书柜墙",
    summary: "用书脊、层板、堆叠和摆件生成一面阅读书柜。",
    priority: "第一阶段"
  },
  {
    key: "cover_collage",
    name: "封面拼贴",
    summary: "把真实书籍封面排成自由拼贴海报。",
    priority: "第一阶段"
  },
  {
    key: "weekly_receipt",
    name: "每周购物小票",
    summary: "把本周阅读时长、天数和书籍排成大脑进货小票。",
    priority: "第一阶段"
  },
  {
    key: "monthly_receipt",
    name: "阅读本月小票",
    summary: "像一张纸质小票一样记录本月阅读账单。",
    priority: "第一阶段"
  },
  {
    key: "reading_calendar",
    name: "本月阅读记录",
    summary: "用月历展示跨日阅读和阅读习惯。",
    priority: "第二阶段"
  },
  {
    key: "annotations_card",
    name: "我的读书卡",
    summary: "把最近阅读的书籍、进度和心动片段生成一张卡片。",
    priority: "第二阶段"
  },
  {
    key: "yearly_receipt",
    name: "年度阅读小票",
    summary: "把一年读过的书和时间压缩成一张年度收据。",
    priority: "后续阶段"
  },
  {
    key: "copywriting_wallpaper",
    name: "文案壁纸",
    summary: "输入一句文案，生成极简墨水屏壁纸。",
    priority: "第一阶段"
  }
];

export function getTemplate(key: string) {
  return templates.find((template) => template.key === key) ?? templates[2];
}
