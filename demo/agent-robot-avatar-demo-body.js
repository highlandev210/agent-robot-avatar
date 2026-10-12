const STYLE_ID = 'agent-demo-body-style';
// The body adds 0.6 × the face size below the face (118 px face → ~71 px).
const BODY_SHIFT = 72;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .canvas.demo-body .avatar-home{place-items:start center}
    .canvas.demo-body-ready .status-pill.demo-status,.canvas.demo-body-ready .demo-control-stack{transition:margin-top .36s cubic-bezier(.16,1,.3,1)}
    .canvas.demo-body .status-pill.demo-status,.canvas.demo-body .demo-control-stack{margin-top:${BODY_SHIFT}px}
    .demo-option.demo-new{position:relative}
    .demo-option.demo-new::after{content:'NEW';position:absolute;top:-6px;right:-6px;padding:2px 5px;border-radius:999px;background:#e5484d;color:#fff;font:700 8px/1 Inter,system-ui,sans-serif;letter-spacing:.05em;pointer-events:none;box-shadow:0 2px 6px rgba(229,72,77,.35)}
  `;
  document.head.appendChild(style);
}

function mountDemoBody() {
  const face = document.getElementById('face');
  const home = document.getElementById('home');
  const canvas = document.getElementById('canvas');
  const panel = document.getElementById('demoSettingsPanel');
  if (!face || !home || !canvas || !panel || typeof face.setBody !== 'function') return;
  if (document.getElementById('demoBody')) return;

  injectStyles();

  const option = document.createElement('label');
  option.className = 'demo-option demo-toggle demo-new';
  option.innerHTML = '<span>Body</span><input id="demoBody" type="checkbox" checked><span class="demo-switch" aria-hidden="true"></span>';
  panel.insertBefore(option, panel.firstChild);
  const toggle = option.querySelector('input');

  // The chest dots use the eye color, which follows the "Transparent eyes" setting.
  function syncChestColor() {
    const eyeFill = face.shadowRoot?.getElementById('leftBase')?.getAttribute('fill') || '#ffffff';
    face.shadowRoot?.querySelectorAll('#bodyChest circle').forEach(dot => dot.setAttribute('fill', eyeFill));
  }

  // The chat dialog seats the avatar in small slots beside messages, so the
  // body is only shown while the avatar is on the main canvas.
  function syncBody() {
    const atHome = face.parentElement === home;
    const enabled = toggle.checked && atHome;
    face.setBody(enabled);
    canvas.classList.toggle('demo-body', toggle.checked);
    syncChestColor();
  }

  toggle.addEventListener('change', syncBody);
  document.getElementById('demoEyeThrough')?.addEventListener('change', syncChestColor);
  document.getElementById('demoBgColor')?.addEventListener('input', syncChestColor);
  document.getElementById('demoReset')?.addEventListener('click', syncChestColor);
  new MutationObserver(syncBody).observe(home, { childList: true });
  syncBody();
  // Animate later toggles only; the initial layout should not slide in on load.
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('demo-body-ready')));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDemoBody, { once: true });
else mountDemoBody();

export { mountDemoBody };
