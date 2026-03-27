import type {
  SnapshotMode,
  StateSnapshot,
  VisibleContextSnapshot
} from '@flow-recorder/schema';

import { guessRouteTemplate } from './route-tracker';
import { buildVisibleDomSignature, dominantContainerSignature, DomRefRegistry } from './visibility-context';
import { normalizeText, truncate } from './utils';

export interface SnapshotOptions {
  doc: Document;
  level: SnapshotMode;
  stateId: string;
  target: Element | null;
  visibleContext: VisibleContextSnapshot;
  registry: DomRefRegistry;
  generateId: () => string;
}

export function createStateSnapshot(options: SnapshotOptions): StateSnapshot | null {
  if (options.level === 'off') {
    return null;
  }

  const fragments = collectFragments(options.doc, options.target, options.level);
  const topHeading = options.visibleContext.top_headings[0] ?? null;
  const modalIdentity = options.target?.closest('dialog, [role="dialog"], [aria-modal="true"]');
  const formIdentity = options.target?.closest('form');

  return {
    snapshot_id: options.generateId(),
    state_id: options.stateId,
    created_at_unix_ms: Date.now(),
    level: options.level,
    dom_signature: buildVisibleDomSignature(options.visibleContext),
    route_template_guess: guessRouteTemplate(options.doc.location?.pathname ?? window.location.pathname),
    dominant_container_signature: dominantContainerSignature(options.target),
    top_heading: topHeading,
    active_landmarks: options.visibleContext.landmark_stack ?? [],
    modal_identity: modalIdentity ? options.registry.get(modalIdentity) : null,
    form_identity: formIdentity ? options.registry.get(formIdentity) : null,
    visible_context: options.visibleContext,
    fragments
  };
}

function collectFragments(
  doc: Document,
  target: Element | null,
  level: SnapshotMode,
): StateSnapshot['fragments'] {
  const candidates = new Set<Element>();

  if (target) {
    candidates.add(target);
    const interestingAncestors = [
      target.closest('form'),
      target.closest('dialog, [role="dialog"], [aria-modal="true"]'),
      target.closest('main, section, article, [role="region"]'),
      target.closest('[data-drawer], .drawer, .sheet')
    ].filter((element): element is Element => Boolean(element));

    for (const element of interestingAncestors) {
      candidates.add(element);
    }
  }

  if (level === 'enhanced-local' && doc.body) {
    candidates.add(doc.body);
  }

  const maxBytes = level === 'enhanced-local' ? 12_000 : 4_000;
  let consumed = 0;
  const fragments: StateSnapshot['fragments'] = [];

  for (const element of candidates) {
    const label =
      element === target
        ? 'target'
        : element.matches('form')
          ? 'form'
          : element.matches('dialog, [role="dialog"], [aria-modal="true"]')
            ? 'dialog'
            : element.matches('[data-drawer], .drawer, .sheet')
              ? 'drawer'
              : element === doc.body
                ? 'body'
                : element.tagName.toLowerCase();

    const outerHtml = sanitizeFragment(element, label === 'body' ? 4000 : 1500);
    consumed += outerHtml.length;
    if (consumed > maxBytes) {
      break;
    }

    fragments.push({
      label,
      outer_html: outerHtml
    });
  }

  return fragments;
}

function sanitizeFragment(element: Element, maxLength: number): string {
  const clone = element.cloneNode(true);
  if (!(clone instanceof Element)) {
    return '';
  }

  for (const input of clone.querySelectorAll('input, textarea, select')) {
    if (input instanceof HTMLInputElement) {
      input.value = input.type === 'checkbox' || input.type === 'radio' ? String(input.checked) : '[redacted]';
      input.setAttribute('value', input.value);
    } else if (input instanceof HTMLTextAreaElement) {
      input.value = '[redacted]';
      input.textContent = '[redacted]';
    } else if (input instanceof HTMLSelectElement) {
      for (const option of input.options) {
        option.removeAttribute('selected');
      }
    }
  }

  const html = truncate(clone.outerHTML, maxLength);
  const heading = normalizeText(element.textContent, 40);
  return heading ? `${html}\n<!-- ${heading} -->` : html;
}
