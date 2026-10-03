// Unscoped legacy images must never be assigned to the currently signed-in account.
export function clearLegacyMemberImages() {
  for (const key of ['topeak_custom_avatar', 'topeak_custom_banner']) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be blocked; these keys are no longer read anywhere.
    }
  }
}

export async function prepareMemberImage(
  file: File,
  maxSide: number,
  quality: number,
): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해 주세요.');
  if (file.size === 0) throw new Error('비어 있는 사진은 등록할 수 없어요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 사진을 선택해 주세요.');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () =>
        reject(new Error('이 사진을 읽지 못했어요. JPG 또는 PNG로 다시 선택해 주세요.'));
      next.src = source;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 처리할 수 없어요. 다시 시도해 주세요.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('사진 압축에 실패했어요.'))),
        'image/jpeg',
        quality,
      );
    });
    if (blob.size > 5 * 1024 * 1024)
      throw new Error('압축한 사진이 너무 커요. 다른 사진을 선택해 주세요.');
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(source);
  }
}
