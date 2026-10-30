// content.js
function injectScript(file_path) {
  try {
    const node = document.getElementsByTagName('head')[0] || document.documentElement;
    const script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', chrome.runtime.getURL(file_path));
    node.appendChild(script);
  } catch (e) {}
}

injectScript('inject.js');

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const message = event.data;
  if (!message || !message.type) return;

  if (['DEEPSEEK_RECORD_USER', 'DEEPSEEK_RECORD_CHUNK', 'DEEPSEEK_RECORD_COMPLETE'].includes(message.type)) {
    let action = 'SAVE_CHUNK';
    if (message.type === 'DEEPSEEK_RECORD_USER') action = 'SAVE_USER';
    if (message.type === 'DEEPSEEK_RECORD_COMPLETE') action = 'SAVE_COMPLETE';

    chrome.runtime.sendMessage({
      action: action,
      sessionId: message.sessionId,
      messageId: message.messageId,
      text: message.text,
      title: message.title
    }).catch(() => {});
  }
});