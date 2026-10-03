import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  deleteMemberImage,
  uploadMemberImage,
  type Member,
  type MemberImageKind,
} from '../api';
import { prepareMemberImage } from '../utils/memberImages';

export interface MemberImageOptions {
  member: Member;
  onMemberUpdated: (member: Member, kind: MemberImageKind) => void;
  onAuthError: (error: ApiError) => void;
}

// 프로필·배경 업로드를 공통 처리하며 계정 변경·화면 이탈 시 진행 중인 요청을 취소한다.
export function useMemberImage(kind: MemberImageKind, options: MemberImageOptions) {
  const { member, onMemberUpdated, onAuthError } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [member.userId],
  );

  async function changeImage(file?: File) {
    // Do not let duplicate taps reorder writes to the same server image.
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setError('');
    setIsSaving(true);
    try {
      let updated: Member;
      if (file) {
        const prepared = await prepareMemberImage(
          file,
          kind === 'profile' ? 500 : 900,
          kind === 'profile' ? 0.85 : 0.75,
        );
        if (controller.signal.aborted) return;
        updated = await uploadMemberImage(kind, prepared, controller.signal);
      } else {
        updated = await deleteMemberImage(kind, controller.signal);
      }
      if (controller.signal.aborted) return;
      // 요청 중 서버 세션의 계정이 바뀌어도 다른 회원의 이미지 상태가 현재 화면에 섞이지 않게 한다.
      if (updated.userId !== member.userId)
        throw new ApiError(401, '로그인 계정이 변경되었어요. 다시 로그인해 주세요.');
      onMemberUpdated(updated, kind);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error ? cause.message : '사진을 변경하지 못했어요. 다시 시도해 주세요.',
      );
      if (cause instanceof ApiError && cause.status === 401) onAuthError(cause);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setIsSaving(false);
      }
    }
  }

  return {
    isSaving,
    error,
    saveImage: (file: File) => changeImage(file),
    removeImage: () => changeImage(),
  };
}
