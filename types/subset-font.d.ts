declare module "subset-font" {
  type SubsetFontOptions = {
    targetFormat?: "sfnt" | "woff" | "woff2";
    preserveNameIds?: number[];
  };

  export default function subsetFont(
    originalFont: Buffer,
    text: string,
    options?: SubsetFontOptions
  ): Promise<Buffer>;
}
