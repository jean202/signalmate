import { SseDecoder } from '../sse';

describe('SseDecoder', () => {
  test('네트워크 청크 중간에서 잘린 SSE 프레임을 조립한다', () => {
    const decoder = new SseDecoder();

    expect(decoder.push('event: progress\ndata: {"type":"rule_')).toEqual([]);
    expect(decoder.push('complete"}\n\n')).toEqual([
      { event: 'progress', data: { type: 'rule_complete' } },
    ]);
  });

  test('CRLF 구분자가 청크 경계에서 갈려도 프레임을 완성한다', () => {
    const decoder = new SseDecoder();

    expect(decoder.push('event: progress\r\ndata: {"type":"stage_warning"}\r')).toEqual([]);
    expect(decoder.push('\n\r\n')).toEqual([
      { event: 'progress', data: { type: 'stage_warning' } },
    ]);
  });

  test('여러 data 줄과 기본 message 이벤트를 디코딩한다', () => {
    const decoder = new SseDecoder();

    expect(decoder.push('data: {"message":\n' + 'data: "안녕하세요"}\n\n')).toEqual([
      { event: 'message', data: { message: '안녕하세요' } },
    ]);
  });
});
