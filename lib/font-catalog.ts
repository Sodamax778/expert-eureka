export type FontOption = {
  key: string;
  name: string;
  category: "system" | "custom";
  cssFamily: string;
  custom?: boolean;
  previewUrl?: string;
};

export const defaultFontKey = "system-sans";

export const builtInFonts: FontOption[] = [
  {
    key: defaultFontKey,
    name: "系统黑体",
    category: "system",
    cssFamily: '"Microsoft YaHei","PingFang SC",Arial,sans-serif'
  },
  {
    key: "system-song",
    name: "宋体",
    category: "system",
    cssFamily: 'SimSun,"Songti SC","Microsoft YaHei",serif'
  },
  {
    key: "system-kai",
    name: "楷体",
    category: "system",
    cssFamily: 'KaiTi,"Kaiti SC","Microsoft YaHei",serif'
  },
  {
    key: "system-fangsong",
    name: "仿宋",
    category: "system",
    cssFamily: 'FangSong,"Fangsong SC","Microsoft YaHei",serif'
  },
  {
    key: "system-deng",
    name: "等线",
    category: "system",
    cssFamily: 'DengXian,"Microsoft YaHei",sans-serif'
  }
];
