const STYLE_ID = 'agent-demo-dialog-i18n-style-r53';

const DIALOG_I18N = Object.freeze({
  "en": {
    "hint": {
      "lead": "Try:",
      "items": [
        "Double-click the avatar",
        "Drag the avatar any direction",
        "Press and hold the center",
        "Drag the antenna"
      ]
    },
    "dialogLabel": "Agent chat demo",
    "subtitle": "Random state response demo",
    "close": "Close",
    "intro": "This is a simulated Agent. Enter anything to trigger random success, confirmation, blocked-content, system-error and other responses, with the matching expression shown below each reply.",
    "placeholder": "Type a message…",
    "keyboard": "Enter to send · Shift+Enter for new line",
    "send": "Send",
    "tags": {
      "success": "Demo expression · Success",
      "warning": "Demo expression · Warning",
      "angry": "Demo expression · Blocked",
      "error": "Demo expression · System error",
      "surprise": "Demo expression · Surprise",
      "bored": "Demo expression · Waiting"
    },
    "replies": {
      "success": [
        "The task is complete and the result looks good.",
        "Finished. There is nothing else you need to do.",
        "Done. This run completed smoothly."
      ],
      "warning": [
        "This action will overwrite existing content. Continue?",
        "This step may cause irreversible changes. Are you sure?",
        "This is a high-impact action. Please confirm before continuing."
      ],
      "angry": [
        "This content cannot be sent. The action has been blocked.",
        "The request is outside the allowed range, so I cannot perform it.",
        "This action does not meet the current rules and has been stopped."
      ],
      "error": [
        "Connection failed. Check the network and try again.",
        "The system cannot complete the request right now. Try again later.",
        "The server connection was interrupted and the action did not finish."
      ],
      "surprise": [
        "That was unexpected. I found a result different from what we anticipated.",
        "This result is more unusual than expected; I need to reassess it.",
        "An unexpected condition appeared, but the information has been preserved."
      ],
      "bored": [
        "Still waiting for an external result; this step is taking longer than usual.",
        "No new changes yet. I am still waiting.",
        "The task is not finished yet and is currently waiting."
      ]
    }
  }
});

function activeLanguage() { return 'en'; }

function text(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function interactionHint(el, hint, language) {
  if (!el || el.dataset.language === language) return;
  el.dataset.language = language;
  const lead = document.createElement('span');
  lead.className = 'demo-interaction-lead';
  lead.textContent = hint.lead;
  const tags = hint.items.map(value => {
    const tag = document.createElement('span');
    tag.className = 'demo-interaction-tag';
    tag.textContent = value;
    return tag;
  });
  el.replaceChildren(lead, ...tags);
  el.setAttribute('aria-label', [hint.lead, ...hint.items].join(' '));
}

function expressionState(tag) {
  return ['success','warning','angry','error','surprise','bored'].find(name => tag?.classList.contains(name)) || null;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .demo-chat-entry-hint{
      position:static;z-index:14;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;
      width:max-content;max-width:100%;padding:0;color:#8f949b;font-size:9px;line-height:1.25;
      pointer-events:none;user-select:none;justify-self:center;
    }
    .demo-interaction-lead{padding:3px 1px;font-weight:650;white-space:nowrap}
    .demo-interaction-tag{padding:4px 7px;border:1px solid rgba(0,0,0,.055);border-radius:999px;background:rgba(255,255,255,.76);white-space:nowrap;box-shadow:0 3px 12px rgba(0,0,0,.025)}
    .status-pill.demo-status{top:calc(39% + 90px)!important}
    @media(max-width:600px){
      .demo-chat-entry-hint{max-width:calc(100vw - 28px);gap:4px}
      .demo-interaction-tag{padding:4px 6px}
      .status-pill.demo-status{top:calc(27% + 88px)!important}
      .demo-control-stack{top:calc(27% + 134px)!important}
    }
    @media(max-width:390px){
      .status-pill.demo-status{top:calc(26% + 88px)!important}
      .demo-control-stack{top:calc(26% + 134px)!important}
    }
  `;
  document.head.appendChild(style);
}

function ensureHint() {
  let hint = document.getElementById('demoChatEntryHint');
  if (hint) return hint;
  const canvas = document.getElementById('canvas');
  const status = document.getElementById('status');
  if (!canvas) return null;
  hint = document.createElement('div');
  hint.id = 'demoChatEntryHint';
  hint.className = 'demo-chat-entry-hint';
  hint.setAttribute('role', 'note');
  const stack = document.querySelector('.demo-control-stack');
  if (stack) stack.prepend(hint);
  else if (status?.parentNode === canvas) canvas.insertBefore(hint, status.nextSibling);
  else canvas.appendChild(hint);
  return hint;
}

function syncDialog() {
  const language = activeLanguage();
  const t = DIALOG_I18N[language];
  const hint = ensureHint();
  interactionHint(hint, t.hint, language);

  const dialog = document.querySelector('.agent-phone');
  if (dialog) dialog.setAttribute('aria-label', t.dialogLabel);
  text(document.querySelector('.panel-sub'), t.subtitle);

  const close = document.getElementById('close');
  if (close) close.setAttribute('aria-label', t.close);

  const input = document.getElementById('input');
  if (input) input.setAttribute('placeholder', t.placeholder);
  text(document.querySelector('.composer-wrap .hint'), t.keyboard);
  text(document.getElementById('send'), t.send);

  const chat = document.getElementById('chat');
  if (!chat) return;

  const agentMessages = Array.from(chat.querySelectorAll('.message.agent:not(.typing)'));
  agentMessages.forEach((message, index) => {
    const bubble = message.querySelector('.bubble');
    const tag = message.querySelector('.expression-tag');
    if (!bubble) return;

    if (!tag) {
      if (index === 0) text(bubble, t.intro);
      return;
    }

    const state = expressionState(tag);
    if (!state || !t.replies[state]) return;
    if (!message.dataset.dialogVariant) message.dataset.dialogVariant = String(index % t.replies[state].length);
    const variant = Number(message.dataset.dialogVariant) % t.replies[state].length;
    text(message.querySelector('.reply-text'), t.replies[state][variant]);
    text(tag, t.tags[state]);
  });
}

function mountDialogI18n() {
  injectStyle();
  syncDialog();

  const chat = document.getElementById('chat');
  if (chat) {
    const chatObserver = new MutationObserver(() => syncDialog());
    chatObserver.observe(chat, { childList: true, subtree: true });
  }


}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDialogI18n, { once: true });
else mountDialogI18n();

export { mountDialogI18n };
