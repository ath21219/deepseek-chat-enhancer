// sidebar.js

function renderMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.*$)/gm, '<strong style="font-size:1.1em; display:block; margin-top:4px;">$1</strong>');
  html = html.replace(/^## (.*$)/gm, '<strong style="font-size:1.2em; display:block; margin-top:4px;">$1</strong>');
  html = html.replace(/^# (.*$)/gm, '<strong style="font-size:1.3em; display:block; margin-top:4px;">$1</strong>');
  html = html.replace(/^(-\s*-\s*-+|\*\s*\*\s*\*+)$/gm, '<hr>');
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^[\-\*] (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

function renderSessions() {
  chrome.storage.local.get(['deepseek_sessions'], (result) => {
    const container = document.getElementById('session-container');
    const sessions = result.deepseek_sessions || {};

    if (Object.keys(sessions).length === 0) {
      container.innerHTML = '<p style="color:#888; font-size:11px; padding:4px;">No items.</p>';
      return;
    }

    container.innerHTML = '';
    const sorted = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

    sorted.forEach((session, index) => {
      const card = document.createElement('div');
      card.className = 'session-card';

      const isOpen = index === 0 ? 'open' : '';
      const displayTitle = session.customTitle || session.title || session.sessionId;

      let messagesHtml = '';
      let allTextForCopy = '';

      if (session.messages && Array.isArray(session.messages)) {
        session.messages.forEach(msg => {
          const isUser = msg.role === 'user';
          const boxClass = isUser ? 'msg-user' : 'msg-assistant';
          const rolePrefix = isUser ? '[user]: ' : '[assistant]: ';
          const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

          allTextForCopy += `${rolePrefix}\n${msg.content}\n\n`;

          messagesHtml += `
            <div class="msg-wrapper">
              <button class="btn-copy btn-copy-top" data-text="${escapeHtml(msg.content)}" title="Copy">📋</button>
              <div class="msg-box ${boxClass}">${renderMarkdown(msg.content)}</div>
              <button class="btn-copy btn-copy-bottom" data-text="${escapeHtml(msg.content)}" title="Copy">📋</button>
              <div class="msg-footer">
                <span class="msg-time">${timeStr}</span>
              </div>
            </div>
          `;
        });
      }

      card.innerHTML = `
        <details ${isOpen}>
          <summary>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;" title="${escapeHtml(displayTitle)}">
              📁 ${escapeHtml(displayTitle)}
            </span>
            <div class="session-actions" onclick="event.stopPropagation()">
              <button class="btn-action btn-rename" data-session-id="${session.sessionId}" title="Change title">✏️</button>
              <button class="btn-action btn-all-copy" data-all-text="${escapeHtml(allTextForCopy)}" title="Copy all">📋</button>
              <button class="btn-action btn-delete" data-session-id="${session.sessionId}" title="Delete">🗑️</button>
            </div>
          </summary>
          <div class="session-content">
            <div style="font-size:9px; color:var(--time-color); margin-bottom:4px;">更新: ${new Date(session.updatedAt).toLocaleTimeString()}</div>
            ${messagesHtml}
          </div>
        </details>
      `;

      container.appendChild(card);
    });

    document.querySelectorAll('.msg-wrapper .btn-copy').forEach(btn => {
      btn.onclick = (e) => {
        const text = e.target.getAttribute('data-text');
        navigator.clipboard.writeText(text).then(() => {
          const wrapper = e.target.closest('.msg-wrapper');
          const siblingButtons = wrapper.querySelectorAll('.btn-copy');
          siblingButtons.forEach(b => b.innerText = '✔');
          setTimeout(() => {
            siblingButtons.forEach(b => b.innerText = '📋');
          }, 1200);
        });
      };
    });

    document.querySelectorAll('.btn-all-copy').forEach(btn => {
      btn.onclick = (e) => {
        const text = e.target.getAttribute('data-all-text');
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.innerText;
          btn.innerText = '✔';
          setTimeout(() => { btn.innerText = orig; }, 1200);
        });
      };
    });

    document.querySelectorAll('.btn-rename').forEach(btn => {
      btn.onclick = (e) => {
        const sessionId = e.target.getAttribute('data-session-id');
        const newTitle = prompt('New title:', '');
        if (newTitle !== null) {
          chrome.runtime.sendMessage({
            action: 'UPDATE_SESSION_TITLE',
            sessionId: sessionId,
            customTitle: newTitle.trim()
          });
        }
      };
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.onclick = (e) => {
        const sessionId = e.target.getAttribute('data-session-id');
        if (confirm('Confirm deletion')) {
          chrome.runtime.sendMessage({ action: 'DELETE_SESSION', sessionId: sessionId });
        }
      };
    });
  });
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

renderSessions();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'UI_UPDATE') {
    renderSessions();
  }
});