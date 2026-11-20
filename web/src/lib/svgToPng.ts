/** Logos sometimes come as .svg, which the video renderer can't read. Turn one into a sharp PNG (kept transparent). */
export async function svgToPng(file: File, width = 1200): Promise<File> {
  if (!/svg/i.test(file.type) && !/\.svg$/i.test(file.name)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 600, h = img.naturalHeight || 600;
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round((width * h) / w);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that logo."))), "image/png"));
    return new File([blob], file.name.replace(/\.svg$/i, "") + ".png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
