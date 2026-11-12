import { useState } from 'react';

type Props = { userId: number; nickname: string | null; src: string | null; className: string };
function AvatarContent({ nickname, src, className }: Props) {
  const [failed, setFailed] = useState(false);
  const visible = Boolean(src) && !failed;
  return (
    <span className={`${className}${visible ? '' : ' is-initials'}`}>
      {visible ? (
        <img
          src={src!}
          alt={`${nickname}님의 프로필 사진`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        Array.from((nickname ?? '').trim())
          .slice(-2)
          .join('') || '산'
      )}
    </span>
  );
}
// 회원·이미지 버전·주소가 변경되거나 사진이 삭제되면 이전 이미지의 로딩 실패 상태를 초기화한다.
export default function ProfileAvatar(props: Props) {
  return <AvatarContent key={`${props.userId}:${props.src ?? 'none'}`} {...props} />;
}
