// sidebar.js

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.title) node.title = opts.title;
  if (opts.style) node.style.cssText = opts.style;
  children.forEach((c) => node.appendChild(c));
  return node;
}

function appendInline(parent, text) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const tok = m[0];
    if (tok.startsWith('`')) {
      parent.appendChild(el('code', { text: tok.slice(1, -1) }));
    } else if (tok.startsWith('**')) {
      parent.appendChild(el('strong', { text: tok.slice(2, -2) }));
    } else {
      parent.appendChild(el('em', { text: tok.slice(1, -1) }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}

const HEADING_SIZES = { 1: '1.3em', 2: '1.2em', 3: '1.1em' };

function renderBlocks(parent, text) {
  const lines = text.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  let list = null;
  let prevWasText = false;

  lines.forEach((line) => {
    let m;

    if (/^(-\s*-\s*-+|\*\s*\*\s*\*+)$/.test(line)) {
      list = null;
      prevWasText = false;
      parent.appendChild(document.createElement('hr'));
      return;
    }

    if ((m = line.match(/^[-*] (.*)$/))) {
      if (!list) {
        list = document.createElement('ul');
        parent.appendChild(list);
      }
      const li = document.createElement('li');
      appendInline(li, m[1]);
      list.appendChild(li);
      prevWasText = false;
      return;
    }
    list = null;

    if ((m = line.match(/^(#{1,3}) (.*)$/))) {
      const h = el('strong', {
        style: `font-size:${HEADING_SIZES[m[1].length]}; display:block; margin-top:4px;`,
      });
      appendInline(h, m[2]);
      parent.appendChild(h);
      prevWasText = false;
      return;
    }

    if ((m = line.match(/^> (.*)$/))) {
      const bq = document.createElement('blockquote');
      appendInline(bq, m[1]);
      parent.appendChild(bq);
      prevWasText = false;
      return;
    }

    if (prevWasText) parent.appendChild(document.createElement('br'));
    appendInline(parent, line);
    prevWasText = true;
  });
}

function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;

  const codeRe = /```([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) renderBlocks(frag, text.slice(last, m.index));
    frag.appendChild(el('pre', {}, [el('code', { text: m[1] })]));
    last = m.index + m[0].length;
  }
  if (last < text.length) renderBlocks(frag, text.slice(last));
  return frag;
}

function flashButtons(buttons, original) {
  buttons.forEach((b) => (b.textContent = '✔'));
  setTimeout(() => {
    buttons.forEach((b) => (b.textContent = original));
  }, 1200);
}

function buildMessage(msg) {
  const isUser = msg.role === 'user';
  const boxClass = isUser ? 'msg-user' : 'msg-assistant';
  const timeStr = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  const makeCopyBtn = (posClass) =>
    el('button', { className: `btn-copy ${posClass}`, title: 'Copy', text: '📋' });

  const topBtn = makeCopyBtn('btn-copy-top');
  const bottomBtn = makeCopyBtn('btn-copy-bottom');

  [topBtn, bottomBtn].forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content || '').then(() => {
        flashButtons([topBtn, bottomBtn], '📋');
      });
    });
  });

  const box = el('div', { className: `msg-box ${boxClass}` });
  box.appendChild(renderMarkdown(msg.content));

  return el('div', { className: 'msg-wrapper' }, [
    topBtn,
    box,
    bottomBtn,
    el('div', { className: 'msg-footer' }, [
      el('span', { className: 'msg-time', text: timeStr }),
    ]),
  ]);
}

function buildSessionCard(session, index) {
  const card = el('div', { className: 'session-card' });
  const displayTitle = session.customTitle || session.title || session.sessionId;

  let allTextForCopy = '';
  const messageEls = [];

  if (Array.isArray(session.messages)) {
    session.messages.forEach((msg) => {
      const rolePrefix = msg.role === 'user' ? '[user]: ' : '[assistant]: ';
      allTextForCopy += `${rolePrefix}\n${msg.content}\n\n`;
      messageEls.push(buildMessage(msg));
    });
  }

  const details = document.createElement('details');
  if (index === 0) details.open = true;

  const titleSpan = el('span', {
    style:
      'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;',
    title: displayTitle,
    text: `📁 ${displayTitle}`,
  });

  const renameBtn = el('button', {
    className: 'btn-action btn-rename',
    title: 'Change title',
    text: '✏️',
  });
  const copyAllBtn = el('button', {
    className: 'btn-action btn-all-copy',
    title: 'Copy all',
    text: '📋',
  });
  const deleteBtn = el('button', {
    className: 'btn-action btn-delete',
    title: 'Delete',
    text: '🗑️',
  });

  renameBtn.addEventListener('click', () => {
    const newTitle = prompt('New title:', '');
    if (newTitle !== null) {
      chrome.runtime.sendMessage({
        action: 'UPDATE_SESSION_TITLE',
        sessionId: session.sessionId,
        customTitle: newTitle.trim(),
      });
    }
  });

  copyAllBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(allTextForCopy).then(() => {
      flashButtons([copyAllBtn], '📋');
    });
  });

  deleteBtn.addEventListener('click', () => {
    if (confirm('Confirm deletion')) {
      chrome.runtime.sendMessage({
        action: 'DELETE_SESSION',
        sessionId: session.sessionId,
      });
    }
  });

  const actions = el('div', { className: 'session-actions' }, [
    renameBtn,
    copyAllBtn,
    deleteBtn,
  ]);
  actions.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  const summary = el('summary', {}, [titleSpan, actions]);

  const updatedLabel = el('div', {
    style: 'font-size:9px; color:var(--time-color); margin-bottom:4px;',
    text: `Last updated: ${new Date(session.updatedAt).toLocaleTimeString()}`,
  });
  const content = el('div', { className: 'session-content' }, [
    updatedLabel,
    ...messageEls,
  ]);

  details.appendChild(summary);
  details.appendChild(content);
  card.appendChild(details);
  return card;
}

function renderSessions() {
  chrome.storage.local.get(['deepseek_sessions'], (result) => {
    const container = document.getElementById('session-container');
    const sessions = result.deepseek_sessions || {};

    container.replaceChildren();

    if (Object.keys(sessions).length === 0) {
      container.appendChild(
        el('p', {
          style: 'color:#888; font-size:11px; padding:4px;',
          text: 'No items.',
        })
      );
      return;
    }

    const sorted = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    sorted.forEach((session, index) => {
      container.appendChild(buildSessionCard(session, index));
    });
  });
}

renderSessions();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'UI_UPDATE') {
    renderSessions();
  }
});