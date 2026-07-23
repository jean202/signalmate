export type SseFrame = {
  event: string;
  data: unknown;
};

export class SseDecoder {
  private buffer = '';

  push(chunk: string): SseFrame[] {
    this.buffer = `${this.buffer}${chunk}`.replace(/\r\n/g, '\n');
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() ?? '';

    return blocks.flatMap((block) => {
      let event = 'message';
      const data: string[] = [];

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }

      if (data.length === 0) return [];
      return [{ event, data: JSON.parse(data.join('\n')) }];
    });
  }
}
