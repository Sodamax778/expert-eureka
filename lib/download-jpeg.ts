type DownloadJpegOptions = {
  imageUrl: string;
  width: number;
  height: number;
  filename: string;
  quality?: number;
};

function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = imageUrl;
  });
}

export async function downloadImageAsJpeg({
  imageUrl,
  width,
  height,
  filename,
  quality = 0.95
}: DownloadJpegOptions) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法转换 JPG 图片");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("JPG 图片生成失败"));
      },
      "image/jpeg",
      quality
    );
  });

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename.toLowerCase().endsWith(".jpg") ? filename : `${filename}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
