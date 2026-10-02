import { useMemberImage, type MemberImageOptions } from './useMemberImage';

export function useCustomAvatar(options: MemberImageOptions) {
  const { isSaving, error, saveImage, removeImage } = useMemberImage('profile', options);
  const url = options.member.profileImageUrl;
  const customAvatar = url?.startsWith('/api/users/me/images/profile') ? url : null;
  return { customAvatar, isSaving, error, saveAvatar: saveImage, removeAvatar: removeImage };
}
