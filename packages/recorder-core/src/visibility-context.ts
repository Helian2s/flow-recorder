import type {
  ContainerIdentity,
  SelectorCandidate,
  TargetMetadata,
  VisibleContextItem,
  VisibleContextSnapshot
} from '@flow-recorder/schema';

import { analyzeTarget } from '@flow-recorder/selector-engine';

import { isScrollableElement, normalizeText, simpleHash, truncate } from './utils';

const CONTEXT_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role]',
  'dialog',
  '[aria-modal="true"]',
  '[data-modal]',
  '[data-drawer]',
  'main',
  'nav',
  'aside',
  'header',
  'footer',
  'section',
  'article',
  'table',
  '[role="grid"]',
  '[role="tab"]',
  '[role="tabpanel"]',
  '[role="alert"]',
  '[role="status"]',
  '[role="banner"]',
  'h1',
  'h2',
  'h3',
  'li'
].join(',');

export class DomRefRegistry {
  private readonly refs = new WeakMap<Element, string>();
  private sequence = 0;

  get(element: Element): string {
    const existing = this.refs.get(element);
    if (existing) {
      return existing;
    }
    this.sequence += 1;
    const created = `dom_${this.sequence}`;
    this.refs.set(element, created);
    return created;
  }
}

export function captureVisibleContext(
  doc: Document,
  registry: DomRefRegistry,
  limit = 24,
): VisibleContextSnapshot {
  const elements = [...doc.querySelectorAll<HTMLElement>(CONTEXT_SELECTOR)]
    .filter((element) => isVisible(element))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top;
    })
    .slice(0, limit);

  const items = elements.map((element) => createContextItem(element, registry));
  const activeDialogs = elements
    .filter((element) => isDialogLike(element))
    .map((element) => createContextItem(element, registry));
  const activeDrawers = elements
    .filter((element) => element.matches('[data-drawer], .drawer, .sheet'))
    .map((element) => createContextItem(element, registry));
  const headings = [...doc.querySelectorAll('h1, h2, h3')]
    .map((item) => normalizeText(item.textContent, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
  const focusedElement =
    doc.activeElement instanceof Element ? registry.get(doc.activeElement) : null;
  const landmarkStack = items
    .map((item) => item.landmark)
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index);

  return {
    captured_at_unix_ms: Date.now(),
    items,
    active_dialogs: activeDialogs,
    active_drawers: activeDrawers,
    top_headings: headings,
    focused_dom_ref: focusedElement,
    landmark_stack: landmarkStack
  };
}

export function buildTargetMetadata(
  element: Element,
  registry: DomRefRegistry,
): { target: TargetMetadata; selectors: SelectorCandidate[] } {
  const analysis = analyzeTarget(element);
  const rect = element.getBoundingClientRect();
  const nearestForm = element.closest('form');
  const nearestLandmark = element.closest('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="complementary"]');
  const nearestContainer = element.closest(
    '[role="dialog"], dialog, [data-modal], [data-drawer], [role="region"], section, article, li, table, [role="grid"]',
  );
  const nearestHeading = findNearestHeadingText(element);
  const nearestLabelText = findNearestLabelText(element);

  return {
    selectors: analysis.selectors,
    target: {
      tag_name: element.tagName.toLowerCase(),
      node_name: element.nodeName,
      input_type: element instanceof HTMLInputElement ? element.type : null,
      role: element.getAttribute('role') ?? inferRole(element),
      accessible_name: analysis.accessible_name,
      text_snippet: normalizeText(element.textContent, 80),
      aria_label: element.getAttribute('aria-label'),
      placeholder: element.getAttribute('placeholder'),
      name_attr: element.getAttribute('name'),
      id_attr: element.getAttribute('id'),
      class_list: [...element.classList].slice(0, 6),
      href: element instanceof HTMLAnchorElement ? element.href : null,
      checked: element instanceof HTMLInputElement ? element.checked : null,
      disabled: element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.disabled : null,
      read_only:
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : null,
      bounding_box: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      center_point: {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
      },
      in_viewport: isVisible(element),
      iframe_path: buildIframePath(element.ownerDocument.defaultView),
      shadow_dom_path: buildShadowPath(element),
      ancestry_summary: buildAncestrySummary(element),
      nearest_form: createContainerIdentity(nearestForm, registry, 'form'),
      nearest_landmark: createContainerIdentity(nearestLandmark, registry, 'landmark'),
      nearest_heading: nearestHeading,
      nearest_label_text: nearestLabelText,
      nearest_container: createNearestContainerIdentity(nearestContainer, registry),
      scroll_container: createContainerIdentity(findScrollContainer(element), registry, 'scroll-container')
    }
  };
}

export function buildVisibleDomSignature(snapshot: VisibleContextSnapshot): string {
  const basis = snapshot.items
    .map((item) => `${item.tag_name}:${item.accessible_name ?? item.text_snippet ?? ''}`)
    .join('|');
  return simpleHash(basis);
}

export function dominantContainerSignature(element: Element | null): string | null {
  if (!element) {
    return null;
  }

  const container = element.closest('main, section, article, form, [role="dialog"], dialog, [role="region"]');
  if (!container) {
    return null;
  }

  const text = normalizeText(container.textContent, 240) ?? '';
  return simpleHash(`${container.tagName.toLowerCase()}:${text}`);
}

function createContextItem(element: HTMLElement, registry: DomRefRegistry): VisibleContextItem {
  const rect = element.getBoundingClientRect();
  const analysis = analyzeTarget(element, { maxCandidates: 3 });

  return {
    dom_ref: registry.get(element),
    tag_name: element.tagName.toLowerCase(),
    role: element.getAttribute('role') ?? inferRole(element),
    accessible_name: analysis.accessible_name,
    text_snippet: normalizeText(element.textContent, 60),
    bounding_box: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    visibility_ratio: visibilityRatio(rect),
    interactive: isInteractive(element),
    landmark: nearestLandmarkName(element),
    selector_candidates: analysis.selectors.slice(0, 3)
  };
}

function createNearestContainerIdentity(
  element: Element | null,
  registry: DomRefRegistry,
): ContainerIdentity | null {
  if (!element) {
    return null;
  }

  if (isDialogLike(element)) {
    return createContainerIdentity(element, registry, 'dialog');
  }
  if (element.matches('[data-drawer], .drawer, .sheet')) {
    return createContainerIdentity(element, registry, 'drawer');
  }
  if (element.matches('table, [role="grid"]')) {
    return createContainerIdentity(element, registry, 'grid');
  }
  if (element.matches('li, [role="listitem"]')) {
    return createContainerIdentity(element, registry, 'list');
  }

  return createContainerIdentity(element, registry, 'region');
}

function createContainerIdentity(
  element: Element | null,
  registry: DomRefRegistry,
  kind: ContainerIdentity['kind'],
): ContainerIdentity | null {
  if (!element) {
    return null;
  }

  const analysis = analyzeTarget(element, { maxCandidates: 2 });
  return {
    kind,
    dom_ref: registry.get(element),
    label: analysis.accessible_name,
    text_snippet: normalizeText(element.textContent, 80),
    selector_candidates: analysis.selectors.slice(0, 2)
  };
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function visibilityRatio(rect: DOMRect): number {
  const horizontal = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const vertical = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const visibleArea = horizontal * vertical;
  const totalArea = Math.max(rect.width * rect.height, 1);
  return Number((visibleArea / totalArea).toFixed(2));
}

function isInteractive(element: HTMLElement): boolean {
  return Boolean(
    element.matches(
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex]',
    ),
  );
}

function inferRole(element: Element): string | null {
  if (element instanceof HTMLAnchorElement) {
    return 'link';
  }
  if (element instanceof HTMLButtonElement) {
    return 'button';
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
  return null;
}

function buildAncestrySummary(element: Element): TargetMetadata['ancestry_summary'] {
  const summary: NonNullable<TargetMetadata['ancestry_summary']> = [];
  let current: Element | null = element.parentElement;
  let depth = 0;

  while (current && depth < 4) {
    const analysis = analyzeTarget(current, { maxCandidates: 1 });
    summary.push({
      tag_name: current.tagName.toLowerCase(),
      role: current.getAttribute('role') ?? inferRole(current),
      id_attr: current.getAttribute('id'),
      class_list: [...current.classList].slice(0, 4),
      accessible_name: analysis.accessible_name
    });
    current = current.parentElement;
    depth += 1;
  }

  return summary;
}

function findNearestHeadingText(element: Element): string | null {
  const explicit = element.closest('section, article, main, form, [role="dialog"], dialog');
  const heading = explicit?.querySelector('h1, h2, h3');
  return normalizeText(heading?.textContent ?? null, 80);
}

function findNearestLabelText(element: Element): string | null {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return normalizeText(element.labels?.[0]?.textContent ?? null, 80);
  }

  return normalizeText(element.closest('label')?.textContent ?? null, 80);
}

function nearestLandmarkName(element: Element): string | null {
  const landmark =
    element.closest('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="complementary"]');
  if (!landmark) {
    return null;
  }
  return landmark.getAttribute('role') ?? landmark.tagName.toLowerCase();
}

function isDialogLike(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  return element.matches('dialog, [role="dialog"], [aria-modal="true"], [data-modal]');
}

function buildShadowPath(element: Element): string[] {
  const path: string[] = [];
  let currentRoot = element.getRootNode();

  while (currentRoot instanceof ShadowRoot) {
    const host = currentRoot.host;
    path.unshift(host.tagName.toLowerCase());
    currentRoot = host.getRootNode();
  }

  return path;
}

function buildIframePath(win: Window | null | undefined): string[] {
  if (!win) {
    return [];
  }

  const path: string[] = [];
  let current: Window | null = win;
  while (current && current.parent !== current) {
    const frame = current.frameElement;
    if (!(frame instanceof HTMLIFrameElement)) {
      break;
    }
    path.unshift(frame.getAttribute('name') ?? truncate(frame.src, 80));
    current = current.parent;
  }
  return path;
}

function findScrollContainer(element: Element): Element | null {
  let current: Element | null = element.parentElement;
  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
