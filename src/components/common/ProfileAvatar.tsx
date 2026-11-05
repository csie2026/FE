import { useState } from 'react';

type Props = { userId: number; nickname: string; src: string | null; className: string };
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
        Array.from(nickname.trim()).slice(-2).join('') || '산'
      )}
    </span>
  );
}
// Reset a failed image on every member or revision/source change, including deletion.
export default function ProfileAvatar(props: Props) {
  return <AvatarContent key={`${props.userId}:${props.src ?? 'none'}`} {...props} />;
}
