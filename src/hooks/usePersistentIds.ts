import { useState } from 'react';

const readIds = (key: string): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : [];
  } catch {
    return [];
  }
};

// 관심·완등 표시를 브라우저 저장소에 유지하는 UI 상태이며 회원별 서버 기록과는 별개다.
export function usePersistentIds(key: string) {
  const [ids, setIds] = useState<string[]>(() => readIds(key));

  function toggle(id: string) {
    setIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the in-memory interaction available when browser storage is disabled.
      }
      return next;
    });
  }

  return { ids, toggle };
}
