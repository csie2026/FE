import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'topeak_custom_banner';

function readBanner() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value?.startsWith('data:image/') ? value : null;
  } catch {
    return null;
  }
}

async function compressBanner(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('사진을 읽지 못했어요.'));
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    reader.onabort = () => reject(new Error('사진 읽기가 취소되었어요.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error('JPG 또는 PNG 사진으로 다시 선택해 주세요.'));
    next.src = source;
  });
  // Limit both dimensions to protect storage even for very tall portrait photos.
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 처리할 수 없어요.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

export function useCustomBanner() {
  const [customBanner, setCustomBanner] = useState(readBanner);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  async function saveBanner(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일을 선택해 주세요.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('20MB 이하의 사진을 선택해 주세요.');
      return;
    }
    const current = ++requestId.current;
    setIsSaving(true);
    try {
      const resized = await compressBanner(file);
      if (current !== requestId.current) return;
      try {
        localStorage.setItem(STORAGE_KEY, resized);
      } catch {
        throw new Error('배경을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      }
      setCustomBanner(resized);
    } catch (cause) {
      if (current === requestId.current)
        setError(cause instanceof Error ? cause.message : '배경을 변경하지 못했어요.');
    } finally {
      if (current === requestId.current) setIsSaving(false);
    }
  }

  function removeBanner() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      requestId.current += 1;
      setCustomBanner(null);
      setIsSaving(false);
      setError('');
    } catch {
      setError('배경을 삭제하지 못했어요. 브라우저 저장 설정을 확인해 주세요.');
    }
  }
  return { customBanner, isSaving, error, saveBanner, removeBanner };
}
