import { useMemberImage, type MemberImageOptions } from './useMemberImage';

export function useCustomAvatar(options: MemberImageOptions) {
  const { isSaving, error, saveImage, removeImage } = useMemberImage('profile', options);
  const url = options.member.profileImageUrl;
  // OAuth 제공자 이미지는 삭제 대상이 아니므로 회원 업로드 API 주소만 사용자 지정 이미지로 본다.
  const customAvatar = url?.startsWith('/api/users/me/images/profile') ? url : null;
  return { customAvatar, isSaving, error, saveAvatar: saveImage, removeAvatar: removeImage };
}
