import type OpenAI from 'openai';

/** Probe the same visible, non-thinking stream used for interview answers. */
export async function testDeepseekConnection(client: OpenAI, deadlineMs = 15000): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const probe = async () => {
    const stream = await client.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      stream: true,
      thinking: { type: 'disabled' },
      max_tokens: 32,
    } as any, { signal: controller.signal, maxRetries: 0 }) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta?.content?.trim()) return;
    }
    throw new Error('DeepSeek 未返回有效回答，请稍后重试');
  };
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DeepSeek 连接测试超时，请稍后重试')), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
