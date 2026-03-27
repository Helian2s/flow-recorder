import type { SelectorCandidate } from '@flow-recorder/schema';

export interface SelectorEngineOptions {
  maxCandidates?: number;
}

export interface ReplayContextHints {
  inside_modal: boolean;
  inside_drawer: boolean;
  required_scroll: boolean;
  same_origin_iframe: boolean;
  open_shadow_root: boolean;
}

export interface TargetAnalysis {
  selectors: SelectorCandidate[];
  accessible_name: string | null;
  label_text: string | null;
  replay_context: ReplayContextHints;
}

const TEST_ATTRIBUTES = [
  'data-testid',
  'data-test',
  'data-qa',
  'data-cy'
] as const satisfies readonly SelectorCandidate['strategy'][];

const DEFAULT_MAX_CANDIDATES = 8;

export function analyzeTarget(
  element: Element,
  options: SelectorEngineOptions = {},
): TargetAnalysis {
  return {
    selectors: generateSelectorCandidates(element, options),
    accessible_name: getAccessibleName(element),
    label_text: getAssociatedLabelText(element),
    replay_context: {
      inside_modal: Boolean(element.closest('[role="dialog"], dialog, [aria-modal="true"]')),
      inside_drawer: Boolean(
        element.closest('[data-drawer], [data-panel="drawer"], .drawer, .sheet'),
      ),
      required_scroll: !isElementMostlyVisible(element),
      same_origin_iframe: window.top !== window.self,
      open_shadow_root: element.getRootNode() instanceof ShadowRoot
    }
  };
}

export function generateSelectorCandidates(
  element: Element,
  options: SelectorEngineOptions = {},
): SelectorCandidate[] {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const seen = new Set<string>();
  const candidates: SelectorCandidate[] = [];

  const push = (candidate: SelectorCandidate | null): void => {
    if (!candidate) {
      return;
    }

    const key = `${candidate.strategy}:${candidate.value}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push(candidate);
  };

  for (const attr of TEST_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (value) {
      push({
        strategy: attr,
        value,
        confidence: 0.99,
        stable: true,
        rationale: `explicit test hook via ${attr}`
      });
    }
  }

  const idValue = element.getAttribute('id');
  if (idValue) {
    push({
      strategy: 'id',
      value: `#${cssEscape(idValue)}`,
      confidence: isStableToken(idValue) ? 0.95 : 0.7,
      stable: isStableToken(idValue),
      rationale: 'id attribute'
    });
  }

  const nameValue = element.getAttribute('name');
  if (nameValue) {
    push({
      strategy: 'name',
      value: nameValue,
      confidence: isStableToken(nameValue) ? 0.9 : 0.68,
      stable: isStableToken(nameValue),
      rationale: 'form name attribute'
    });
  }

  const accessibleName = getAccessibleName(element);
  const role = element.getAttribute('role') ?? inferImplicitRole(element);
  if (role && accessibleName) {
    push({
      strategy: 'aria-role-name',
      value: `${role}[name="${accessibleName}"]`,
      confidence: 0.88,
      stable: true,
      rationale: 'semantic role and accessible name'
    });
  }

  const labelText = getAssociatedLabelText(element);
  if (labelText) {
    push({
      strategy: 'label-text',
      value: labelText,
      confidence: 0.87,
      stable: true,
      rationale: 'associated form label'
    });
  }

  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    push({
      strategy: 'placeholder',
      value: placeholder,
      confidence: 0.74,
      stable: false,
      rationale: 'placeholder attribute'
    });
  }

  if (element instanceof HTMLAnchorElement && element.href) {
    const href = sanitizeHref(element.getAttribute('href') ?? element.href);
    push({
      strategy: 'href',
      value: href,
      confidence: href.startsWith('#') ? 0.62 : 0.79,
      stable: !href.includes('?'),
      rationale: 'anchor href'
    });
  }

  const textValue = getStableText(element);
  if (textValue) {
    push({
      strategy: 'text',
      value: textValue,
      confidence: 0.64,
      stable: false,
      rationale: 'visible text content'
    });
  }

  push(buildCssCandidate(element));
  push(buildXPathCandidate(element));
  push({
    strategy: 'dom-path',
    value: buildDomPath(element),
    confidence: 0.25,
    stable: false,
    rationale: 'DOM ancestry fallback'
  });

  return candidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxCandidates);
}

function buildCssCandidate(element: Element): SelectorCandidate | null {
  const selectorParts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < 4) {
    const idValue = current.getAttribute('id');
    if (idValue && isStableToken(idValue)) {
      selectorParts.unshift(`#${cssEscape(idValue)}`);
      return {
        strategy: 'css',
        value: selectorParts.join(' > ') || `#${cssEscape(idValue)}`,
        confidence: 0.82,
        stable: true,
        rationale: 'stable id anchored CSS selector'
      };
    }

    const stableClasses = [...current.classList].filter(isStableToken).slice(0, 2);
    const base = current.tagName.toLowerCase();
    const classSelector = stableClasses.map((item) => `.${cssEscape(item)}`).join('');
    const nth = getNthOfType(current);
    selectorParts.unshift(`${base}${classSelector}:nth-of-type(${nth})`);
    current = current.parentElement;
    depth += 1;
  }

  if (selectorParts.length === 0) {
    return null;
  }

  return {
    strategy: 'css',
    value: selectorParts.join(' > '),
    confidence: 0.53,
    stable: false,
    rationale: 'bounded CSS ancestry fallback'
  };
}

function buildXPathCandidate(element: Element): SelectorCandidate {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current) {
    const idValue = current.getAttribute('id');
    if (idValue && isStableToken(idValue)) {
      parts.unshift(`*[@id="${idValue}"]`);
      break;
    }

    const index = getNthOfType(current);
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }

  return {
    strategy: 'xpath',
    value: `//${parts.join('/')}`,
    confidence: 0.33,
    stable: false,
    rationale: 'XPath fallback'
  };
}

function buildDomPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && parts.length < 6) {
    parts.unshift(`${current.tagName.toLowerCase()}:${getNthOfType(current)}`);
    current = current.parentElement;
  }

  return parts.join('>');
}

function getNthOfType(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }

  return index;
}

function getAccessibleName(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) {
      return text;
    }
  }

  const labelText = getAssociatedLabelText(element);
  if (labelText) {
    return labelText;
  }

  const altText = element.getAttribute('alt')?.trim();
  if (altText) {
    return altText;
  }

  const title = element.getAttribute('title')?.trim();
  if (title) {
    return title;
  }

  return getStableText(element);
}

function getAssociatedLabelText(element: Element): string | null {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLElement
    )
  ) {
    return null;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (element.labels && element.labels.length > 0) {
      const labels = [...element.labels]
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean);

      if (labels.length > 0) {
        return labels.join(' ');
      }
    }
  }

  const wrapperLabel = element.closest('label');
  const labelText = wrapperLabel?.textContent?.replace(/\s+/g, ' ').trim();
  return labelText || null;
}

function getStableText(element: Element): string | null {
  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text || text.length > 80) {
    return null;
  }
  return text;
}

function inferImplicitRole(element: Element): string | null {
  if (element instanceof HTMLButtonElement) {
    return 'button';
  }
  if (element instanceof HTMLAnchorElement) {
    return 'link';
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') {
      return 'checkbox';
    }
    if (element.type === 'radio') {
      return 'radio';
    }
    return 'textbox';
  }
  if (element instanceof HTMLSelectElement) {
    return 'combobox';
  }
  if (element instanceof HTMLTextAreaElement) {
    return 'textbox';
  }
  return null;
}

function isStableToken(token: string): boolean {
  return token.length > 1 && !/[A-Fa-f0-9]{8,}/.test(token) && !/\d{4,}/.test(token);
}

function sanitizeHref(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    return `${url.pathname}${url.hash}`;
  } catch {
    return value;
  }
}

function isElementMostlyVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
