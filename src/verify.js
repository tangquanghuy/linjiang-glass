/* Overlay harness for eyeballing the replica against the prototype.
   1 off · 2 half · 3 full · 4 difference · G toggle glass · H hide this hint */

const MODES = { Digit1: 'off', Digit2: 'half', Digit3: 'full', Digit4: 'diff' };

export function initVerify(stage, hint) {
  const show = (mode) => {
    stage.dataset.ref = mode;
    hint.textContent =
      `ref: ${mode}   [1] off  [2] half  [3] full  [4] difference   [G] glass on/off   [H] hide`;
  };
  show('off');

  addEventListener('keydown', (e) => {
    if (MODES[e.code]) show(MODES[e.code]);
    else if (e.code === 'KeyG') stage.classList.toggle('no-glass');
    else if (e.code === 'KeyH') hint.style.display = hint.style.display === 'none' ? '' : 'none';
  });
}
