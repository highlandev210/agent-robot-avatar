const INSPECT_LABELS = Object.freeze({
  "en": {
    "action": "Inspect",
    "state": "Inspect / Verify"
  }
});

const FAILURE_LABELS = Object.freeze({
  "en": {
    "action": "Failure",
    "state": "Failure"
  }
});

const LOVE_LABELS = Object.freeze({
  "en": {
    "action": "Love",
    "state": "Love / Heart"
  }
});

const RANDOM_LABELS = Object.freeze({
  "en": {
    "action": "Random",
    "state": "Random / Slot machine"
  }
});

const WRAP_WAITING_LABELS = Object.freeze({
  "en": "Waiting · Wrap"
});

function activeLanguage() { return 'en'; }

// Actions added in the latest release are shown last and flagged with a corner badge.
function markAsNew(button) {
  button.classList.add('is-new');
  button.dataset.new = 'NEW';
}

function ensureActionButton(action, afterAction) {
  const controls = document.querySelector('.controls');
  if (!controls) return null;
  let button = controls.querySelector(`[data-action="${action}"]`);
  if (button) return button;
  button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  const anchor = controls.querySelector(`[data-action="${afterAction}"]`);
  if (anchor) anchor.insertAdjacentElement('afterend', button);
  else controls.appendChild(button);
  return button;
}

function syncActionLabels() {
  const inspect = INSPECT_LABELS[activeLanguage(INSPECT_LABELS)];
  const failure = FAILURE_LABELS[activeLanguage(FAILURE_LABELS)];
  const love = LOVE_LABELS[activeLanguage(LOVE_LABELS)];
  const random = RANDOM_LABELS[activeLanguage(RANDOM_LABELS)];
  const inspectButton = ensureActionButton('inspect', 'warning');
  const failureButton = ensureActionButton('failure', 'success');
  const wrapButton = ensureActionButton('waiting-wrap', 'waiting');
  // New actions go at the very end of the row, in the order they were added.
  const loveButton = ensureActionButton('love', 'wake');
  const randomButton = ensureActionButton('random', 'love');
  for (const button of [loveButton, randomButton]) if (button) markAsNew(button);
  if (inspectButton) inspectButton.textContent = inspect.action;
  if (failureButton) failureButton.textContent = failure.action;
  if (loveButton) loveButton.textContent = love.action;
  if (randomButton) randomButton.textContent = random.action;
  if (wrapButton) wrapButton.textContent = WRAP_WAITING_LABELS[activeLanguage(WRAP_WAITING_LABELS)];
}

function applyDefaultAntennaFlashOff() {
  const toggle = document.getElementById('demoAntennaFlash');
  if (!toggle) return;
  toggle.checked = false;
  const face = document.getElementById('face');
  face?.setAntennaFlash?.(false);
  const dot = face?.shadowRoot?.getElementById('antennaDot');
  if (dot) dot.style.opacity = '1';
}

function mountWaitingSync() {
  const face = document.getElementById('face');
  const chat = document.getElementById('chat');
  if (!face || !chat) return;
  const sync = () => {
    const typing = chat.querySelector('.message.agent.typing');
    if (!typing || typing.dataset.avatarWaitingStarted === '1') return;
    typing.dataset.avatarWaitingStarted = '1';
    if (typeof face.startWaiting === 'function') face.startWaiting();
  };
  new MutationObserver(sync).observe(chat, { childList: true, subtree: true });
  sync();
}

function mountStateLabels() {
  const face = document.getElementById('face');
  const status = document.getElementById('status');
  if (!face || !status) return;
  face.addEventListener('face-state', event => {
    const state = event.detail?.state;
    if (state === 'inspect') {
      const t = INSPECT_LABELS[activeLanguage(INSPECT_LABELS)];
      status.textContent = `inspect · ${t.state}`;
    } else if (state === 'failure') {
      const t = FAILURE_LABELS[activeLanguage(FAILURE_LABELS)];
      status.textContent = `failure · ${t.state}`;
    } else if (state === 'love') {
      const t = LOVE_LABELS[activeLanguage(LOVE_LABELS)];
      status.textContent = `love · ${t.state}`;
    } else if (state === 'random') {
      const t = RANDOM_LABELS[activeLanguage(RANDOM_LABELS)];
      status.textContent = `random · ${t.state}`;
    }
  });
}

function mountExtras() {
  syncActionLabels();
  applyDefaultAntennaFlashOff();
  mountWaitingSync();
  mountStateLabels();


}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountExtras, { once: true });
else mountExtras();

export { mountExtras };
