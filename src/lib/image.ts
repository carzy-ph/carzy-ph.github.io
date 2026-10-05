/** Center-crops to a square and shrinks to a JPEG, so agent photos load fast on mobile data. */
export function squareJpeg(file: File, size = 600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const out = Math.min(size, side);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = out;
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(img.src);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Could not read that image. Try a JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}

/** Shrinks a wide photo (keeps its shape) to a JPEG for the card's cover. */
export function coverJpeg(file: File, maxWidth = 1400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => reject(new Error('Could not read that image. Try a JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}
