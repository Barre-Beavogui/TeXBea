// Turns a photo (camera, file, paste or drop) into a JPEG data URL small enough for the vision model.
export async function prepareImage(file, maxSide = 1344) {
  if (!file?.type?.startsWith('image/')) throw Error('Choisis une image (photo, capture d’écran…).');
  if (file.size > 20_000_000) throw Error('Image trop lourde (20 Mo maximum).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.9);
}

// First image in a paste or drop, if any.
export function imageFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')) || null;
}
