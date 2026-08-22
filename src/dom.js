const BLOCKED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'formaction']);

function unsafeUrl(value) {
  return /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(String(value || ''));
}

function scrub(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements = [];
  while (walker.nextNode()) elements.push(walker.currentNode);

  for (const element of elements) {
    if (BLOCKED_ELEMENTS.has(element.tagName)) {
      element.remove();
      continue;
    }
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRIBUTES.has(name) && unsafeUrl(value)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === 'style' && /(?:javascript\s*:|data\s*:\s*text\/html|expression\s*\()/i.test(value)) {
        element.removeAttribute(attr.name);
      }
    }
  }
  return root;
}

export function safeFragment(html, doc = document) {
  const template = doc.createElement('template');
  template.innerHTML = String(html ?? '');
  return scrub(template.content);
}

export function setSafeHTML(element, html) {
  element.replaceChildren(safeFragment(html, element.ownerDocument));
  return element;
}

export function safeFirstElement(html, doc = document) {
  const fragment = safeFragment(html, doc);
  return fragment.firstElementChild;
}

export function insertSafeHTML(element, position, html) {
  const fragment = safeFragment(html, element.ownerDocument);
  if (position === 'afterbegin') element.prepend(fragment);
  else if (position === 'beforeend') element.append(fragment);
  else if (position === 'beforebegin') element.before(fragment);
  else if (position === 'afterend') element.after(fragment);
  else throw new TypeError(`Unsupported insert position: ${position}`);
  return element;
}

let imageFallbacksInstalled = false;
export function installImageFallbacks(root = document) {
  if (imageFallbacksInstalled) return;
  imageFallbacksInstalled = true;
  root.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const fallback = image.dataset.fallbackSrc;
    if (fallback && image.src !== fallback) {
      delete image.dataset.fallbackSrc;
      image.src = fallback;
      return;
    }
    if (image.hasAttribute('data-remove-on-error')) image.remove();
  }, true);
}
