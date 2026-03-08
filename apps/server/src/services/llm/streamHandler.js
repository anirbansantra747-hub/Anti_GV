/**
 * Stream Handler
 * Converts raw LLM streaming chunks into standardized Socket.io events
 */

/**
 * Handle streaming response from native fetch streams or groq-sdk
 * @param {any} stream - the stream object
 * @param {any} socket - Socket.io socket object
 * @param {string} provider - tracking which provider generated the stream
 * @param {Object} options - { eventName, extraPayload }
 */
export const handleStream = async (stream, socket, provider, options = {}) => {
  const { eventName = 'agent:step:code', extraPayload = {} } = options;
  let fullContent = '';

  // Handle async iterable from groq-sdk
  if (stream[Symbol.asyncIterator]) {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        socket.emit(eventName, { ...extraPayload, chunk: content, provider });
      }
    }
    return fullContent;
  }

  // Handle native fetch ReadableStream (Cerebras / Gemini fallback)
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      buffer += chunkStr;

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete part in the buffer

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              socket.emit(eventName, { ...extraPayload, chunk: content, provider });
            }
          } catch (e) {
            // Unparseable JSON in a stream frame, log it if needed but continue
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
};
