/**
 * Employee photos: JPG, PNG or WebP up to 5 MB, centre-cropped to a square and scaled to 320 px so the
 * record stays small (about 20–40 KB as a data URL).
 */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const SIZE = 320;

export const photoError = (file: File) => {
  if (!PHOTO_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > PHOTO_MAX_BYTES) return 'The photo must be under 5 MB.';
  return '';
};

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be read.'));
    img.src = src;
  });

const asDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('This image could not be read.'));
    r.readAsDataURL(file);
  });

/** Reads, crops and shrinks a photo; rejects with a message suitable for a toast. */
export const readPhoto = async (file: File): Promise<string> => {
  const err = photoError(file);
  if (err) throw new Error(err);
  const original = await asDataUrl(file);
  const img = await load(original);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side < 96) throw new Error('The photo is too small — use one at least 96 px across.');
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Centre crop, nudged up a little so faces are not cut off in portrait shots
  const sx = (img.naturalWidth - side) / 2;
  const sy = Math.max(0, (img.naturalHeight - side) / 2 - (img.naturalHeight > img.naturalWidth ? side * 0.08 : 0));
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/jpeg', 0.85);
};

export const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
