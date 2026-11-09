export const NETWORK_ERROR_MESSAGE =
  '서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해주세요.';
export const TIMEOUT_ERROR_MESSAGE =
  '요청 시간이 초과되어 결과를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';

// 사용자에게 보여줄 문구만 변환한다. 오류 객체의 종류·상태·코드는 변경하지 않는다.
export function getErrorMessage(
  cause: unknown,
  fallback = '요청을 처리하지 못했습니다. 다시 시도해주세요.',
) {
  const value =
    cause !== null && typeof cause === 'object'
      ? (cause as { name?: unknown; message?: unknown })
      : { message: cause };
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (/[가-힣]/.test(message)) return message;
  switch (value.name) {
    case 'AbortError':
      return '요청이 취소되었습니다.';
    case 'TimeoutError':
      return TIMEOUT_ERROR_MESSAGE;
    case 'NetworkError':
      return NETWORK_ERROR_MESSAGE;
    case 'QuotaExceededError':
      return '기기의 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해주세요.';
    case 'SecurityError':
      return '브라우저에서 이 작업을 허용하지 않았습니다. 권한과 저장 설정을 확인해주세요.';
    case 'NotAllowedError':
      return '필요한 권한이 허용되지 않았습니다. 브라우저나 기기의 권한 설정을 확인해주세요.';
    case 'NotReadableError':
      return '선택한 파일을 읽지 못했습니다. 다른 파일을 선택해주세요.';
  }
  if (
    /failed to fetch|fetch failed|network request failed|networkerror|^load failed$/i.test(message)
  )
    return NETWORK_ERROR_MESSAGE;
  return fallback;
}
