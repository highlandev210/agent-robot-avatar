import { expect, test } from '@playwright/test';

async function mount(page, attributes = '') {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/examples/basic.html');
  await page.evaluate(attrs => {
    document.querySelector('.example').innerHTML = `<agent-robot-avatar id="robot" size="120" ${attrs}></agent-robot-avatar>`;
  }, attributes);
  const avatar = page.locator('#robot');
  await expect.poll(() => avatar.evaluate(element => Boolean(element._bodyRig))).toBe(true);
  return { avatar, pageErrors };
}

test('body is opt-in and keeps the default layout untouched', async ({ page }) => {
  const { avatar, pageErrors } = await mount(page);

  const result = await avatar.evaluate(element => {
    const host = element.getBoundingClientRect();
    const face = element._faceRect();
    return {
      width: host.width,
      height: host.height,
      faceMatchesHost: face.width === host.width && face.height === host.height,
      rigDisplay: getComputedStyle(element.shadowRoot.getElementById('bodyRig')).display,
      setBody: typeof element.setBody,
    };
  });

  expect(result).toEqual({ width: 120, height: 120, faceMatchesHost: true, rigDisplay: 'none', setBody: 'function' });
  expect(pageErrors).toEqual([]);
});

test('body attribute extends the element below the face and can be toggled', async ({ page }) => {
  const { avatar, pageErrors } = await mount(page, 'body color="#2b59c3"');

  const enabled = await avatar.evaluate(element => {
    const host = element.getBoundingClientRect();
    const face = element._faceRect();
    const fill = id => element.shadowRoot.querySelector(`#${id}`).getAttribute('fill');
    return {
      width: host.width,
      height: host.height,
      face: { width: face.width, height: face.height, top: face.top - host.top },
      rigDisplay: getComputedStyle(element.shadowRoot.getElementById('bodyRig')).display,
      fills: [fill('bodyShape'), fill('bodyArmL > path'), fill('bodyArmR > path')],
    };
  });
  expect(enabled).toEqual({
    width: 120,
    height: 192,
    face: { width: 120, height: 120, top: 0 },
    rigDisplay: 'inline',
    fills: ['#2b59c3', '#2b59c3', '#2b59c3'],
  });

  const disabled = await avatar.evaluate(element => {
    element.setBody(false);
    const host = element.getBoundingClientRect();
    return { height: host.height, attribute: element.hasAttribute('body') };
  });
  expect(disabled).toEqual({ height: 120, attribute: false });

  const reenabled = await avatar.evaluate(element => {
    element.setAttribute('body', 'false');
    const off = element.getBoundingClientRect().height;
    element.setBody(true);
    return { off, on: element.getBoundingClientRect().height };
  });
  expect(reenabled).toEqual({ off: 120, on: 192 });
  expect(pageErrors).toEqual([]);
});

test('pointer gaze stays relative to the face when the body is shown', async ({ page }) => {
  const { avatar } = await mount(page, 'body');
  const box = await avatar.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.width / 2);
  await expect.poll(() => avatar.evaluate(element => ({
    x: Math.round(element._pointer.x),
    y: Math.round(element._pointer.y),
  }))).toEqual({ x: 0, y: 0 });
});

test('body poses follow success and settle into an egg while asleep', async ({ page }) => {
  const { avatar, pageErrors } = await mount(page, 'body');

  await avatar.evaluate(element => { element._task = element.play('success'); });
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.mood)).toBe('happy');
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.arms.L.rot), { timeout: 2000 }).toBeGreaterThan(100);
  expect(await avatar.evaluate(element => -element._bodyRig.arms.R.rot)).toBeGreaterThan(100);
  await avatar.evaluate(element => element._task);

  await avatar.evaluate(element => { element._task = element.play('sleep'); });
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.mood), { timeout: 3000 }).toBe('sleep');
  await expect.poll(() => avatar.evaluate(element => ({
    paused: element._raf === 0,
    settled: element._bodyRig.settled,
    tucked: Math.max(element._bodyRig.arms.L.s, element._bodyRig.arms.R.s) < .75,
  })), { timeout: 8000 }).toEqual({ paused: true, settled: true, tucked: true });

  await avatar.evaluate(element => element.play('wake'));
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.arms.L.s), { timeout: 3000 }).toBeGreaterThan(.95);
  expect(pageErrors).toEqual([]);
}, { timeout: 20000 });

test('waiting spins the arms with the eyes and lights the chest', async ({ page }) => {
  const { avatar } = await mount(page, 'body');

  await avatar.evaluate(element => element.startWaiting());
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.mix.orbit), { timeout: 3000 }).toBeGreaterThan(.99);
  const layers = new Set();
  for (let i = 0; i < 12; i++) {
    layers.add(await avatar.evaluate(element => element._bodyRig.arms.L.behind));
    await page.waitForTimeout(110);
  }
  expect([...layers].sort()).toEqual([false, true]);
  expect(Number(await avatar.evaluate(element => element.shadowRoot.getElementById('bodyChest').getAttribute('opacity')))).toBeGreaterThan(.9);

  await avatar.evaluate(element => element.stopWaiting());
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.mix.chest), { timeout: 3000 }).toBeLessThan(.05);
});

test('pressing the body pokes it without dragging the head', async ({ page }) => {
  const { avatar, pageErrors } = await mount(page, 'body');
  await page.waitForTimeout(300);
  const box = await avatar.boundingBox();
  const actions = [];
  await page.exposeFunction('recordAction', detail => actions.push(detail));
  await avatar.evaluate(element => element.addEventListener('action-state', event => window.recordAction(event.detail.action)));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height * .78);
  await page.mouse.down();
  const during = await avatar.evaluate(element => ({
    dragging: element._dragJelly.active,
    gesture: element._gestureFx?.kind ?? null,
    kicked: Math.abs(element._bodyRig.body.vy) > 10,
  }));
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height * .9, { steps: 4 });
  await page.mouse.up();

  expect(during).toEqual({ dragging: false, gesture: null, kicked: true });
  expect(await avatar.evaluate(element => element._dragJelly.active || element._dragJelly.returning)).toBe(false);
  expect(actions).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('reduced motion holds the body still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { avatar } = await mount(page, 'body');
  await page.waitForTimeout(200);

  const read = () => avatar.evaluate(element => element.shadowRoot.getElementById('bodyTorso').getAttribute('transform'));
  const first = await read();
  await page.waitForTimeout(600);
  expect(await read()).toBe(first);

  await avatar.evaluate(element => { element._task = element.play('success'); });
  await expect.poll(() => avatar.evaluate(element => element._bodyRig.arms.L.rot), { timeout: 2000 }).toBeGreaterThan(100);
});

test('demo shows the body by default, toggles it, and hides it inside the chat dialog', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/demo/');
  const face = page.locator('#face');
  const toggle = page.locator('#demoBody');

  await expect(toggle).toBeChecked();
  await expect.poll(() => face.evaluate(element => element.hasAttribute('body'))).toBe(true);
  const shifted = await page.evaluate(() => getComputedStyle(document.querySelector('.demo-control-stack')).marginTop);
  expect(shifted).toBe('72px');

  const box = await face.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.width / 2);
  await expect(page.locator('#agentOverlay')).toHaveClass(/open/);
  await expect.poll(() => face.evaluate(element => element.hasAttribute('body'))).toBe(false);
  await page.locator('#close').click();
  await expect.poll(() => face.evaluate(element => element.hasAttribute('body'))).toBe(true);

  await toggle.evaluate(input => input.click());
  await expect.poll(() => face.evaluate(element => ({
    body: element.hasAttribute('body'),
    height: Math.round(element.getBoundingClientRect().height),
  }))).toEqual({ body: false, height: 118 });
  expect(pageErrors).toEqual([]);
});
