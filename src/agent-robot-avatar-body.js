import AgentRobotAvatar, { registerAvatarExtension } from './agent-robot-avatar-extension-host.js';

// Optional floating body: an egg-shaped torso with detached arms that hover
// below the face. Like the antenna dot, every part is spring-driven and trails
// the head, so all existing head motion (pointer follow, drag, squeeze, action
// bobs) carries through to the body without per-action plumbing.

const SVG_NS = 'http://www.w3.org/2000/svg';
const proto = AgentRobotAvatar.prototype;
const baseRenderShell = proto._renderShell;
const baseApplyColor = proto._applyColor;
const baseFaceRect = proto._faceRect;
const baseStartGesture = proto._startGesture;
const baseCanPauseFrames = proto._canPauseFrames;
const baseTeardownRuntime = proto._teardownRuntime;

const VIEW_HEIGHT = 384;
const HEAD_BOTTOM = 205;
const BODY_TOP = 220;
const BODY_PIVOT_Y = 284;
const GROUND_Y = 370;
const SHOULDER_X = 82;
const SHOULDER_Y = BODY_TOP + 22;
const ORBIT_RADIUS = 84;
const TORSO_PATH = 'M 120 220 C 159 220 186 230 186 260 C 186 302 152 349 120 349 C 88 349 54 302 54 260 C 54 230 81 220 120 220 Z';
// Teardrop arm hanging from its shoulder pivot at (0, 0): wide at the top, tapering to the hand.
const ARM_PATH = 'M 0 -1 C 9 -1 13.5 10 13.5 30 C 13.5 58 7 86 0 86 C -7 86 -13.5 58 -13.5 30 C -13.5 10 -9 -1 0 -1 Z';

const ENABLED = ':host([body]:not([body="false"]))';
const BODY_STYLE = `
  ${ENABLED}{height:auto;aspect-ratio:240 / ${VIEW_HEIGHT}}
  ${ENABLED} svg{height:auto;aspect-ratio:1 / 1}
  #bodyRig{display:none}
  ${ENABLED} #bodyRig{display:inline}
`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Arm values use an outward-positive rotation: 150 raises either arm up beside
// the head, negative values tuck the hand in toward the torso. `x` moves the
// shoulder inward, `y` moves it down, `s` scales the arm.
const ARM_REST = Object.freeze({ x: 0, y: 0, rot: -8, s: 1 });
const POSE_DEFAULTS = Object.freeze({
  x: 0, y: 0, rot: 0, sq: 0,
  hover: 3, speed: 1, sway: 2.5,
  wave: 0, shake: 0, glitch: 0, typing: 0, swing: 0, rock: 0,
  chest: 0, orbit: 0, reach: true,
});

function pose(overrides = {}) {
  const { arm, armL, armR, ...rest } = overrides;
  const left = { ...ARM_REST, ...arm, ...armL };
  const right = { ...ARM_REST, ...arm, ...armR };
  return Object.freeze({ ...POSE_DEFAULTS, reach: false, ...rest, armL: left, armR: right });
}

const POSES = Object.freeze({
  idle: pose({ reach: true }),
  bored: pose({ hover: 2.4, speed: .7, sway: 0, swing: 12, rock: 2 }),
  drowsy: pose({ y: 3, hover: 1.2, speed: .55, sway: .6, arm: { y: 4, rot: -3 } }),
  sleep: pose({ y: 5, hover: 0, sway: 0, arm: { x: 34, y: 2, rot: -14, s: .72 } }),
  wake: pose({ y: -6, arm: { rot: 46 } }),
  happy: pose({ y: -7, hover: 4, speed: 2, sway: 0, wave: 9, arm: { rot: 138, y: -4 } }),
  sad: pose({ y: 9, hover: 1.2, speed: .6, sway: .5, sq: -.015, arm: { x: 5, y: 7, rot: -2 } }),
  angry: pose({ y: 2, hover: 1.6, speed: 1.4, sway: 0, shake: 1.4, arm: { y: -2, rot: 34 } }),
  error: pose({ hover: 2, sway: 0, glitch: 14, arm: { rot: 20 } }),
  warning: pose({ y: 2, rot: -2, sway: 0, armL: { rot: 148, y: -4 }, armR: { rot: -6 } }),
  surprise: pose({ y: -9, sway: 0, sq: .03, arm: { rot: 44 } }),
  love: pose({ y: -3, sway: 0, rock: 4, arm: { y: -6, rot: 50 } }),
  input: pose({ sway: 0, typing: 2.4, arm: { x: 4, y: -2, rot: -16 } }),
  send: pose({ y: 6, sway: 0, arm: { x: 6, rot: -24 } }),
  inspect: pose({ rot: -2, sway: 0, armL: { rot: 26 }, armR: { rot: 150, x: -4, y: -4 } }),
  random: pose({ sway: 0 }),
  waiting: pose({ chest: 1, orbit: 1, sway: 0 }),
  'waiting-wrap': pose({ chest: 1, sway: 0, swing: 10 }),
  squeeze: pose({ hover: 1, sway: 0 }),
  'antenna-drag': pose({ y: -4, sway: 0, arm: { rot: 136 } }),
  drag: pose({ hover: 1, sway: 0, arm: { rot: 22 } }),
});

// Velocity kicks applied once when a mood begins.
const ENTRY_IMPULSE = Object.freeze({
  happy: { vy: -120 },
  surprise: { vy: -150, arm: 420 },
  wake: { vy: -110, arm: 260 },
  angry: { sq: -1.2 },
});

const SPRING = Object.freeze({
  body: { k: 70, d: 10.5 },
  bodyRot: { k: 60, d: 9 },
  squash: { k: 180, d: 12 },
  arm: { k: 150, d: 10 },
  armRot: { k: 120, d: 11 },
  armScale: { k: 160, d: 14 },
});

function bodyEnabled(face) {
  return face.hasAttribute('body') && face.getAttribute('body') !== 'false';
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function ensureBodyShell(face) {
  if (face._bodyRig?.root?.isConnected) return face._bodyRig;
  const root = face.shadowRoot;
  const svg = root?.querySelector('svg');
  const anchor = face._dragMotion;
  if (!svg || !anchor || typeof document === 'undefined') return null;

  const style = document.createElement('style');
  style.textContent = BODY_STYLE;
  root.insertBefore(style, svg);

  const rig = svgEl('g', { id: 'bodyRig', 'aria-hidden': 'true' });
  const shadow = svgEl('ellipse', { id: 'bodyShadow', cx: 0, cy: 0, rx: 46, ry: 5, opacity: .14 });
  const torso = svgEl('g', { id: 'bodyTorso' });
  const torsoShape = svgEl('path', { id: 'bodyShape', d: TORSO_PATH });
  const chest = svgEl('g', { id: 'bodyChest', opacity: 0 });
  const dots = [-14, 0, 14].map(dx => svgEl('circle', { cx: 120 + dx, cy: BODY_TOP + 52, r: 4.5, fill: '#fff' }));
  chest.append(...dots);
  torso.append(torsoShape, chest);
  const makeArm = id => {
    const group = svgEl('g', { id });
    group.append(svgEl('path', { d: ARM_PATH }));
    return group;
  };
  const armL = makeArm('bodyArmL');
  const armR = makeArm('bodyArmR');
  rig.append(shadow, torso, armL, armR);
  svg.insertBefore(rig, anchor);

  face._bodyRig = {
    root: rig, svg, style, shadow, torso, torsoShape, chest, dots, armEls: { L: armL, R: armR },
    initialized: false, active: false, settled: false, last: 0, fill: null,
    mood: 'idle', moodStart: 0, phase: 0, clock: 0, jitter: { x: 0, L: 0, R: 0 },
    body: { x: 0, y: 0, rot: 0, sq: 0, vx: 0, vy: 0, vrot: 0, vsq: 0 },
    arms: {
      L: { x: 0, y: 0, rot: 0, s: 1, vx: 0, vy: 0, vrot: 0, vs: 0, behind: false },
      R: { x: 0, y: 0, rot: 0, s: 1, vx: 0, vy: 0, vrot: 0, vs: 0, behind: false },
    },
    mix: { hover: 3, speed: 1, sway: 2.5, wave: 0, shake: 0, glitch: 0, typing: 0, swing: 0, rock: 0, chest: 0, orbit: 0, reach: 0 },
  };
  applyBodyColor(face);
  return face._bodyRig;
}

function applyBodyColor(face) {
  const rig = face._bodyRig;
  if (!rig) return;
  const fill = face._head?.getAttribute('fill') || '#08090b';
  if (rig.fill === fill) return;
  rig.fill = fill;
  for (const el of [rig.shadow, rig.torsoShape, rig.armEls.L.firstChild, rig.armEls.R.firstChild]) el.setAttribute('fill', fill);
}

function resolveMood(face) {
  const gesture = face._gestureFx;
  if (gesture?.committed) return gesture.kind;
  if (face._dragJelly?.active && face._dragJelly.moved) return 'drag';
  const record = face._activeActionState;
  const action = record && !record.terminal ? record.action : null;
  if (face._sleeping || face._state === 'sleep') return 'sleep';
  if (face._state === 'sleepy') return action === 'wake' ? 'wake' : 'drowsy';
  if (face._waitingFx) return face._waitingFx.variant === 'wrap' ? 'waiting-wrap' : 'waiting';
  if (face._loveFx) return 'love';
  if (face._randomFx) return 'random';
  if (face._inspectFx) return 'inspect';
  if (face._warningFx) return 'warning';
  if (face._failureFx) return 'sad';
  if (face._systemErrorShake) return 'error';
  switch (face._state) {
    case 'happy': return 'happy';
    case 'sad': return 'sad';
    case 'angry': return 'angry';
    case 'surprise': return action === 'wake' ? 'wake' : 'surprise';
    case 'input': return 'input';
    default: break;
  }
  if (action === 'send') return 'send';
  if (face._boredRoutine) return 'bored';
  return 'idle';
}

// Where the bottom of the face currently is, in SVG units relative to rest,
// including head follow, drag jelly, squeeze and every action animation.
function headAnchor(face, rig) {
  const headMatrix = face._headMotion?.getScreenCTM?.();
  const svgMatrix = rig.svg?.getScreenCTM?.();
  if (!headMatrix || !svgMatrix || typeof DOMPoint === 'undefined') return { dx: 0, dy: 0, rot: 0 };
  try {
    const inverse = svgMatrix.inverse();
    const center = new DOMPoint(120, 120).matrixTransform(headMatrix).matrixTransform(inverse);
    const bottom = new DOMPoint(120, HEAD_BOTTOM).matrixTransform(headMatrix).matrixTransform(inverse);
    return {
      dx: bottom.x - 120,
      dy: bottom.y - HEAD_BOTTOM,
      rot: Math.atan2(-(bottom.x - center.x), bottom.y - center.y) * 180 / Math.PI,
    };
  } catch (_) {
    return { dx: 0, dy: 0, rot: 0 };
  }
}

function bodyScale(body) {
  return { sx: 1 - body.sq * .5, sy: 1 + body.sq };
}

function transformBodyPoint(body, x, y) {
  const { sx, sy } = bodyScale(body);
  const lx = (x - 120) * sx;
  const ly = (y - BODY_PIVOT_Y) * sy;
  const a = body.rot * Math.PI / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: 120 + lx * cos - ly * sin + body.x,
    y: BODY_PIVOT_Y + lx * sin + ly * cos + body.y,
  };
}

function step(state, key, velocityKey, target, spring, h) {
  state[velocityKey] += ((target - state[key]) * spring.k - state[velocityKey] * spring.d) * h;
  state[key] += state[velocityKey] * h;
}

function integrate(dt, fn) {
  for (let remaining = dt; remaining > 1e-6;) {
    const h = Math.min(1 / 120, remaining);
    remaining -= h;
    fn(h);
  }
}

function enterMood(rig, mood, now, reduced) {
  if (rig.mood === mood) return;
  rig.mood = mood;
  rig.moodStart = now;
  const kick = ENTRY_IMPULSE[mood];
  if (!kick || reduced || !rig.initialized) return;
  rig.body.vy += kick.vy || 0;
  rig.body.vsq += kick.sq || 0;
  if (kick.arm) {
    rig.arms.L.vrot += kick.arm;
    rig.arms.R.vrot -= kick.arm;
  }
}

function pointerReach(face, now) {
  const pointer = face._pointer;
  if (!pointer?.active || face._expressionLock || now - (pointer.lastMove || 0) > 1600) return { L: 0, R: 0 };
  const amount = clamp(((pointer.influence || 0) - .35) / .5, 0, 1) * 42;
  const side = clamp(pointer.x / 30, -1, 1);
  return { L: amount * Math.max(0, -side), R: amount * Math.max(0, side) };
}

function updateBody(face, now) {
  const rig = ensureBodyShell(face);
  if (!rig) return;
  applyBodyColor(face);

  const reduced = face._isReducedMotion?.() === true;
  const fresh = !rig.initialized || !rig.active;
  const dt = fresh ? 0 : clamp((now - rig.last) / 1000, 0, .05);
  rig.last = now;
  rig.active = true;

  const mood = resolveMood(face);
  enterMood(rig, mood, now, reduced);
  const target = POSES[mood] || POSES.idle;
  const elapsed = Math.max(0, now - rig.moodStart) / 1000;

  // Smooth the oscillator amplitudes so moods blend instead of popping.
  const mix = rig.mix;
  const blend = fresh || reduced ? 1 : 1 - Math.exp(-dt * 7);
  for (const key of ['hover', 'speed', 'sway', 'wave', 'shake', 'glitch', 'typing', 'swing', 'rock', 'chest', 'orbit']) {
    const goal = reduced && key !== 'chest' && key !== 'speed' ? 0 : target[key];
    mix[key] = lerp(mix[key], goal, blend);
  }
  mix.reach = lerp(mix.reach, target.reach && !reduced ? 1 : 0, blend);
  rig.phase = (rig.phase + dt * TAU * mix.speed / 2.8) % (TAU * 1000);
  rig.clock += dt;
  const t = rig.clock;

  const head = reduced ? { dx: 0, dy: 0, rot: 0 } : headAnchor(face, rig);
  const lookX = reduced ? 0 : (face._look?.x || 0);
  // Fast tremors bypass the springs (which would filter them out) and are
  // added at render time instead.
  rig.jitter.x = mix.shake * Math.sin(t * TAU * 18) * Math.exp(-elapsed * 2.4);
  const bodyGoal = {
    x: head.dx * .55 + lookX * .1 + target.x,
    y: head.dy * .5 + target.y + Math.sin(rig.phase) * mix.hover,
    rot: head.rot * .4 + lookX * .05 + target.rot + Math.sin(t * TAU / 1.15) * mix.rock - rig.body.vx * .03,
    sq: target.sq,
  };
  const gesture = face._gestureFx;
  if (mood === 'squeeze' && gesture) {
    const q = clamp(gesture.q || 0, -.3, 1);
    bodyGoal.sq = -.1 * q;
    bodyGoal.y += 6 * q;
  }

  const body = rig.body;
  if (fresh || reduced) {
    Object.assign(body, { x: bodyGoal.x, y: bodyGoal.y, rot: bodyGoal.rot, sq: bodyGoal.sq, vx: 0, vy: 0, vrot: 0, vsq: 0 });
  } else {
    integrate(dt, h => {
      step(body, 'x', 'vx', bodyGoal.x, SPRING.body, h);
      step(body, 'y', 'vy', bodyGoal.y, SPRING.body, h);
      step(body, 'rot', 'vrot', bodyGoal.rot, SPRING.bodyRot, h);
      step(body, 'sq', 'vsq', bodyGoal.sq, SPRING.squash, h);
    });
  }

  const reach = pointerReach(face, now);
  const orbitAngle = face._waitingFx && mix.orbit > .001
    ? ((Math.max(0, now - face._waitingFx.start) % face._waitingFx.duration) / face._waitingFx.duration) * Math.PI * 4
    : 0;
  let maxMotion = 0;

  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const outward = side === 'L' ? 1 : -1;
    const spec = side === 'L' ? target.armL : target.armR;
    const offset = side === 'L' ? 0 : Math.PI;
    const arm = rig.arms[side];

    let rot = spec.rot;
    let y = spec.y;
    rig.jitter[side] = Math.sin(t * TAU * 7.3 + offset * 1.3) * mix.glitch * Math.exp(-elapsed * 1.5) * outward;
    rot += Math.sin(rig.phase * .5 + (side === 'L' ? 0 : 1.7)) * mix.sway;
    rot += Math.sin(t * TAU * 2.4 + offset) * mix.wave;
    rot += Math.sin(t * TAU / 2.4 + offset) * mix.swing;
    rot += reach[side] * mix.reach;
    y += Math.sin(t * TAU * 3 + offset) * mix.typing;
    if (mood === 'random' && side === 'R' && face._randomFx) {
      // Pull the slot-machine lever: raise, then yank down as the reels start.
      rot = elapsed < .22 ? 150 : -14;
    }
    if (mood === 'squeeze' && gesture) rot += 30 * clamp(gesture.q || 0, 0, 1);

    const shoulder = transformBodyPoint(body, 120 + sign * (SHOULDER_X - spec.x), SHOULDER_Y + y);
    const goal = { x: shoulder.x, y: shoulder.y, rot: rot * outward + body.rot, s: spec.s };

    if (mix.orbit > .001) {
      // Spin the arms around the torso in step with the waiting eye orbit.
      const cos = Math.cos(orbitAngle);
      const depth = Math.sin(orbitAngle) * -sign;
      const orbitShoulder = transformBodyPoint(body, 120 + sign * ORBIT_RADIUS * cos, SHOULDER_Y);
      goal.x = lerp(goal.x, orbitShoulder.x, mix.orbit);
      goal.y = lerp(goal.y, orbitShoulder.y, mix.orbit);
      goal.rot = lerp(goal.rot, (-8 * cos) * outward + body.rot, mix.orbit);
      goal.s = lerp(goal.s, 1 + .06 * depth, mix.orbit);
      setArmLayer(rig, side, mix.orbit > .5 && depth < 0);
    } else {
      setArmLayer(rig, side, false);
    }

    if (fresh || reduced || mix.orbit > .999) {
      if (!fresh && !reduced && dt > 0) {
        arm.vx = (goal.x - arm.x) / dt;
        arm.vy = (goal.y - arm.y) / dt;
        arm.vrot = (goal.rot - arm.rot) / dt;
        arm.vs = 0;
      } else {
        arm.vx = arm.vy = arm.vrot = arm.vs = 0;
      }
      Object.assign(arm, { x: goal.x, y: goal.y, rot: goal.rot, s: goal.s });
    } else {
      integrate(dt, h => {
        step(arm, 'x', 'vx', goal.x, SPRING.arm, h);
        step(arm, 'y', 'vy', goal.y, SPRING.arm, h);
        step(arm, 'rot', 'vrot', goal.rot, SPRING.armRot, h);
        step(arm, 's', 'vs', goal.s, SPRING.armScale, h);
      });
    }
    maxMotion = Math.max(maxMotion,
      Math.abs(arm.vx), Math.abs(arm.vy), Math.abs(arm.vrot), Math.abs(arm.vs),
      Math.abs(goal.x - arm.x), Math.abs(goal.y - arm.y), Math.abs(goal.rot - arm.rot));
  }
  maxMotion = Math.max(maxMotion,
    Math.abs(body.vx), Math.abs(body.vy), Math.abs(body.vrot), Math.abs(body.vsq) * 100,
    Math.abs(bodyGoal.x - body.x), Math.abs(bodyGoal.y - body.y), Math.abs(bodyGoal.rot - body.rot));
  const oscillating = mix.hover + mix.sway + mix.wave + mix.typing + mix.swing + mix.rock + mix.orbit + mix.shake + mix.glitch > .01 ||
    (mix.chest > .01 && !reduced) || Math.abs(mix.chest - target.chest) > .01;
  rig.settled = !oscillating && maxMotion < .02;
  rig.initialized = true;

  renderBody(rig, t, reduced);
}

function setArmLayer(rig, side, behind) {
  const arm = rig.arms[side];
  if (arm.behind === behind) return;
  arm.behind = behind;
  if (behind) rig.root.insertBefore(rig.armEls[side], rig.torso);
  else rig.root.appendChild(rig.armEls[side]);
}

function renderBody(rig, t, reduced) {
  const { body, arms, mix } = rig;
  const { sx, sy } = bodyScale(body);
  rig.torso.setAttribute('transform',
    `translate(${(body.x + rig.jitter.x).toFixed(2)} ${body.y.toFixed(2)}) rotate(${body.rot.toFixed(2)} 120 ${BODY_PIVOT_Y}) ` +
    `translate(120 ${BODY_PIVOT_Y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-120 ${-BODY_PIVOT_Y})`);

  for (const side of ['L', 'R']) {
    const arm = arms[side];
    rig.armEls[side].setAttribute('transform',
      `translate(${arm.x.toFixed(2)} ${arm.y.toFixed(2)}) rotate(${(arm.rot + rig.jitter[side]).toFixed(2)}) scale(${Math.max(0, arm.s).toFixed(4)})`);
  }

  const lift = clamp(1 + body.y * .012, .55, 1.3);
  rig.shadow.setAttribute('transform', `translate(${(120 + body.x * .7).toFixed(2)} ${GROUND_Y}) scale(${lift.toFixed(4)} 1)`);
  rig.shadow.setAttribute('opacity', (.14 * lift).toFixed(3));

  rig.chest.setAttribute('opacity', mix.chest.toFixed(3));
  if (mix.chest > .001) {
    rig.dots.forEach((dot, index) => {
      const bounce = reduced ? 0 : Math.max(0, Math.sin(t * TAU / 1.2 - index * .9));
      dot.setAttribute('cy', (BODY_TOP + 52 - 4 * bounce).toFixed(2));
      dot.setAttribute('opacity', (reduced ? .9 : .45 + .55 * bounce).toFixed(3));
    });
  }
}

function pokeBody(face, event) {
  const rig = face._bodyRig;
  if (!rig?.initialized) return;
  const hit = el => {
    const r = el.getBoundingClientRect();
    return event.clientX >= r.left - 4 && event.clientX <= r.right + 4 && event.clientY >= r.top - 4 && event.clientY <= r.bottom + 4;
  };
  const reduced = face._isReducedMotion?.() === true;
  if (reduced) return;
  for (const side of ['L', 'R']) {
    if (!hit(rig.armEls[side])) continue;
    rig.arms[side].vrot += side === 'L' ? 520 : -520;
    rig.body.vrot += side === 'L' ? 40 : -40;
    face._resumeFrames?.();
    return;
  }
  if (!hit(rig.torsoShape)) return;
  rig.body.vy += 90;
  rig.body.vsq -= 1.6;
  rig.arms.L.vrot += 260;
  rig.arms.R.vrot -= 260;
  face._resumeFrames?.();
}

proto._renderShell = function() {
  const result = baseRenderShell.call(this);
  this._bodyRig = null;
  ensureBodyShell(this);
  return result;
};

proto._applyColor = function(value) {
  const result = baseApplyColor.call(this, value);
  applyBodyColor(this);
  return result;
};

proto._faceRect = function() {
  if (!bodyEnabled(this)) return baseFaceRect.call(this);
  const rect = this._bodyRig?.svg?.getBoundingClientRect?.();
  return rect && rect.width > 0 ? rect : baseFaceRect.call(this);
};

proto._startGesture = function(event) {
  if (bodyEnabled(this) && event.button === 0 && event.isPrimary !== false && event.clientY > this._faceRect().bottom) {
    // Presses below the face belong to the body: they never start a head drag.
    pokeBody(this, event);
    return true;
  }
  return baseStartGesture ? baseStartGesture.call(this, event) : false;
};

proto._canPauseFrames = function(now) {
  if (!baseCanPauseFrames.call(this, now)) return false;
  if (this._runtimeVisible === false || !bodyEnabled(this) || !this._bodyRig?.active) return true;
  return this._bodyRig.settled;
};

proto._teardownRuntime = function() {
  if (this._bodyRig) this._bodyRig.active = false;
  return baseTeardownRuntime?.call(this);
};

proto.setBody = function(enabled = true) {
  if (enabled) this.setAttribute('body', '');
  else this.removeAttribute('body');
  this._resumeFrames?.();
  return this;
};

registerAvatarExtension({
  name: 'body',
  draw(now) {
    if (!bodyEnabled(this)) {
      if (this._bodyRig) this._bodyRig.active = false;
      return;
    }
    updateBody(this, now);
  },
});

export { AgentRobotAvatar };
export default AgentRobotAvatar;
