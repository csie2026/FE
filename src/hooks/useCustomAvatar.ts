import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'topeak_custom_avatar';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function readAvatar() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored?.startsWith('data:image/') ? stored : null;
  } catch {
    return null;
  }
}

async function resizeAvatar(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('사진을 읽지 못했어요. 다시 선택해 주세요.'));
    };
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요. 다시 선택해 주세요.'));
    reader.onabort = () => reject(new Error('사진 선택이 취소되었어요.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () =>
      reject(new Error('이 사진 형식을 표시할 수 없어요. JPG 또는 PNG 사진을 선택해 주세요.'));
    nextImage.src = source;
  });

  const scale = Math.min(1, 500 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 처리할 수 없어요. 다시 시도해 주세요.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function useCustomAvatar() {
  const [customAvatar, setCustomAvatar] = useState(readAvatar);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  async function saveAvatar(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일을 선택해 주세요.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('20MB 이하의 사진을 선택해 주세요.');
      return;
    }
    const currentRequest = ++requestId.current;
    setIsSaving(true);
    try {
      const resized = await resizeAvatar(file);
      if (currentRequest !== requestId.current) return;
      try {
        localStorage.setItem(STORAGE_KEY, resized);
      } catch {
        throw new Error('사진을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      }
      setCustomAvatar(resized);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : '사진을 변경하지 못했어요.');
      }
    } finally {
      if (currentRequest === requestId.current) setIsSaving(false);
    }
  }

  function removeAvatar() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      requestId.current += 1;
      setCustomAvatar(null);
      setIsSaving(false);
      setError('');
    } catch {
      setError('사진을 삭제하지 못했어요. 브라우저 저장 설정을 확인해 주세요.');
    }
  }

  return { customAvatar, isSaving, error, saveAvatar, removeAvatar };
}
