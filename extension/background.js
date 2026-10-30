// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (['SAVE_USER', 'SAVE_CHUNK', 'SAVE_COMPLETE'].includes(request.action)) {
    const { sessionId, messageId, text, title } = request;

    chrome.storage.local.get(['deepseek_sessions'], (result) => {
      const sessions = result.deepseek_sessions || {};

      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          sessionId: sessionId,
          title: title || 'New Chat',
          customTitle: null,
          updatedAt: Date.now(),
          messages: []
        };
      }

      if (title && !sessions[sessionId].title) {
        sessions[sessionId].title = title;
      }

      sessions[sessionId].updatedAt = Date.now();
      let messages = sessions[sessionId].messages;

      const existingIndex = messages.findIndex(m => m.messageId === messageId);
      const role = request.action === 'SAVE_USER' ? 'user' : 'assistant';

      if (existingIndex >= 0) {
        messages[existingIndex].content = text;
        messages[existingIndex].isComplete = request.action === 'SAVE_COMPLETE';
      } else {
        messages.push({
          messageId: messageId,
          role: role,
          content: text,
          timestamp: Date.now(),
          isComplete: request.action === 'SAVE_COMPLETE'
        });
      }

      chrome.storage.local.set({ deepseek_sessions: sessions }, () => {
        chrome.runtime.sendMessage({
          action: 'UI_UPDATE',
          sessionId: sessionId
        }).catch(() => {});
      });
    });

    sendResponse({ status: 'ok' });
  }
  else if (request.action === 'DELETE_SESSION') {
    const { sessionId } = request;
    chrome.storage.local.get(['deepseek_sessions'], (result) => {
      const sessions = result.deepseek_sessions || {};
      if (sessions[sessionId]) {
        delete sessions[sessionId];
        chrome.storage.local.set({ deepseek_sessions: sessions }, () => {
          chrome.runtime.sendMessage({ action: 'UI_UPDATE' }).catch(() => {});
        });
      }
    });
    sendResponse({ status: 'ok' });
  }
  else if (request.action === 'UPDATE_SESSION_TITLE') {
    const { sessionId, customTitle } = request;
    chrome.storage.local.get(['deepseek_sessions'], (result) => {
      const sessions = result.deepseek_sessions || {};
      if (sessions[sessionId]) {
        sessions[sessionId].customTitle = customTitle;
        chrome.storage.local.set({ deepseek_sessions: sessions }, () => {
          chrome.runtime.sendMessage({ action: 'UI_UPDATE' }).catch(() => {});
        });
      }
    });
    sendResponse({ status: 'ok' });
  }
});