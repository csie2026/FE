import { useMemberImage, type MemberImageOptions } from './useMemberImage';

export function useCustomBanner(options: MemberImageOptions) {
  // 공통 이미지 저장 흐름을 배경 이미지 필드와 화면용 이름으로 한정해 제공한다.
  const { isSaving, error, saveImage, removeImage } = useMemberImage('background', options);
  return {
    customBanner: options.member.backgroundImageUrl ?? null,
    isSaving,
    error,
    saveBanner: saveImage,
    removeBanner: removeImage,
  };
}
