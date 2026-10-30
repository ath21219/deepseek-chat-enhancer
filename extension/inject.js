// inject.js
(function () {
  console.log('[Inject] Interceptor loaded in Main World.');

  const OriginalXHR = window.XMLHttpRequest;

  const responseTextDescriptor = Object.getOwnPropertyDescriptor(OriginalXHR.prototype, 'responseText');
  const originalResponseTextGetter = responseTextDescriptor ? responseTextDescriptor.get : null;

  const responseDescriptor = Object.getOwnPropertyDescriptor(OriginalXHR.prototype, 'response');
  const originalResponseGetter = responseDescriptor ? responseDescriptor.get : null;

  function sanitizeText(text) {
    if (typeof text !== 'string') return text;

    const lines = text.split('\n');
    const cleanLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isContentFilter =
        line.includes('CONTENT_FILTER') ||
        (line.includes('TEMPLATE_RESPONSE') && line.includes('status'));

      if (isContentFilter) {
        continue;
      }
      cleanLines.push(line);
    }
    return cleanLines.join('\n');
  }

  function parseSSEChunkForLog(chunk, currentFullText, currentTitle) {
    let fullText = currentFullText;
    let title = currentTitle;
    const lines = chunk.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('event: title')) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.startsWith('data:')) {
          try {
            const titleData = JSON.parse(nextLine.replace('data:', '').trim());
            if (titleData.content) title = titleData.content;
          } catch (e) {}
        }
      }

      if (line.startsWith('data:')) {
        const jsonStr = line.replace('data:', '').trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);

          if (
            line.includes('CONTENT_FILTER') ||
            (data.v && Array.isArray(data.v) && data.v.some(item => item.p === 'status' && item.v === 'CONTENT_FILTER')) ||
            (data.o !== undefined && (data.o === 'BATCH' || data.o === 'SET'))
          ) {
            continue;
          }

          if (data.v && data.v.response) {
            const fragments = data.v.response.fragments || [];
            fragments.forEach(f => {
              if (f.content) fullText += f.content;
            });
          } else if (data.v !== undefined) {
            if (typeof data.v === 'string') {
              fullText += data.v;
            } else if (typeof data.v === 'object' && data.v.v) {
              fullText += data.v.v;
            }
          }
        } catch (err) {}
      }
    }

    return { fullText, title };
  }

  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = '';
    let lastProcessedLength = 0;
    let messageId = 'msg_' + Date.now();
    let fullAssistantText = '';
    let sessionTitle = null;
    let isChatRequest = false;

    const originalOpen = xhr.open;
    xhr.open = function (method, url, ...args) {
      requestUrl = url;
      isChatRequest = url && url.includes('/api/v0/chat/completion');
      return originalOpen.apply(this, [method, url, ...args]);
    };

    const originalSend = xhr.send;
    xhr.send = function (...args) {
      const body = args[0];

      if (isChatRequest) {
        let userPrompt = '';
        let hasAttachment = false;

        try {
          if (typeof body === 'string') {
            const parsedBody = JSON.parse(body);

            if (parsedBody.prompt) {
              userPrompt = parsedBody.prompt;
            } else if (parsedBody.messages) {
              const lastMsg = parsedBody.messages[parsedBody.messages.length - 1];
              if (typeof lastMsg?.content === 'string') {
                userPrompt = lastMsg.content;
              }
            }

            if (Array.isArray(parsedBody.ref_file_ids) && parsedBody.ref_file_ids.length > 0) {
              hasAttachment = true;
            }
          }
        } catch (e) {}

        if (hasAttachment) {
          if (!userPrompt || userPrompt.trim() === '') {
            userPrompt = '[📎]';
          } else {
            userPrompt = `[📎] ${userPrompt}`;
          }
        }

        const sessionId = getSessionIdFromUrl();

        if (userPrompt) {
          window.postMessage({
            type: 'DEEPSEEK_RECORD_USER',
            sessionId: sessionId,
            messageId: 'user_' + Date.now(),
            text: userPrompt
          }, '*');
        }

        const handleProgress = () => {
          if (xhr.status === 200) {
            const rawText = originalResponseTextGetter ? originalResponseTextGetter.call(xhr) : xhr.responseText;
            if (rawText) {
              const newChunk = rawText.substring(lastProcessedLength);
              lastProcessedLength = rawText.length;

              const parsed = parseSSEChunkForLog(newChunk, fullAssistantText, sessionTitle);
              fullAssistantText = parsed.fullText;
              if (parsed.title) sessionTitle = parsed.title;

              window.postMessage({
                type: 'DEEPSEEK_RECORD_CHUNK',
                sessionId: sessionId,
                messageId: messageId,
                text: fullAssistantText,
                title: sessionTitle
              }, '*');
            }
          }
        };

        xhr.addEventListener('progress', handleProgress);
        xhr.addEventListener('load', () => {
          handleProgress();
          window.postMessage({
            type: 'DEEPSEEK_RECORD_COMPLETE',
            sessionId: sessionId,
            messageId: messageId,
            text: fullAssistantText,
            title: sessionTitle
          }, '*');
        });

        try {
          Object.defineProperty(xhr, 'responseText', {
            get: function () {
              const raw = originalResponseTextGetter ? originalResponseTextGetter.call(this) : this.response;
              return sanitizeText(raw);
            },
            configurable: true,
            enumerable: true
          });

          if (originalResponseGetter) {
            Object.defineProperty(xhr, 'response', {
              get: function () {
                const raw = originalResponseGetter.call(this);
                if (typeof raw === 'string') {
                  return sanitizeText(raw);
                }
                return raw;
              },
              configurable: true,
              enumerable: true
            });
          }
        } catch (e) {}
      }

      return originalSend.apply(this, args);
    };

    return xhr;
  }

  window.XMLHttpRequest = PatchedXHR;

  function getSessionIdFromUrl() {
    const match = window.location.href.match(/\/s\/([a-f0-9\-]+)/);
    return match ? match[1] : 'default_session';
  }
})();