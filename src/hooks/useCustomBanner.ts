import { useMemberImage, type MemberImageOptions } from './useMemberImage';

export function useCustomBanner(options: MemberImageOptions) {
  const { isSaving, error, saveImage, removeImage } = useMemberImage('background', options);
  return {
    customBanner: options.member.backgroundImageUrl ?? null,
    isSaving,
    error,
    saveBanner: saveImage,
    removeBanner: removeImage,
  };
}
