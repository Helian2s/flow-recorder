import type {
  CapturedValue,
  RecorderConfig,
  RedactionMetadata,
  RuntimeMode
} from '@flow-recorder/schema';

import { maskValue, matchesSelectorList, normalizeText, simpleHash } from './utils';

const BUILT_IN_SENSITIVE_PATTERN =
  /(password|passwd|token|secret|api[-_]?key|auth|cvv|cvc|card|iban|routing|ssn|social)/i;

export interface RedactionResult {
  capturedValue: CapturedValue | null;
  redaction: RedactionMetadata;
  valueKind: 'none' | 'text' | 'number' | 'boolean' | 'option' | 'redacted';
}

export function captureElementValue(
  element: Element,
  config: RecorderConfig,
  runtimeMode: RuntimeMode,
): RedactionResult {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    return createResult(null, 'none', false, false, []);
  }

  const denylistRules: string[] = [];
  const type = 'type' in element ? element.type : '';
  const selectorDenied = matchesSelectorList(element, config.privacy?.denylistSelectors);
  const selectorAllowed = matchesSelectorList(element, config.privacy?.allowlistSelectors);
  const inputTypeDenied =
    config.privacy?.inputTypeDenylist?.includes(type) || type === 'password' || type === 'hidden';
  const nameAttr = element.getAttribute('name') ?? element.getAttribute('id') ?? '';
  const fieldPatternDenied =
    BUILT_IN_SENSITIVE_PATTERN.test(nameAttr) ||
    (config.privacy?.denylistFieldNamePatterns ?? []).some((pattern) => {
      try {
        return new RegExp(pattern, 'i').test(nameAttr);
      } catch {
        return false;
      }
    });

  if (selectorDenied) {
    denylistRules.push('selector-denylist');
  }
  if (inputTypeDenied) {
    denylistRules.push(`input-type:${type}`);
  }
  if (fieldPatternDenied) {
    denylistRules.push('field-name-denylist');
  }

  const sensitive = denylistRules.length > 0;
  const rawValue = getRawValue(element);
  if (rawValue === null) {
    return createResult(null, 'none', false, sensitive, denylistRules);
  }

  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
    return createResult(
      {
        mode: 'raw',
        raw: String(element.checked),
        length: 1
      },
      'boolean',
      false,
      false,
      denylistRules,
    );
  }

  const safeForRaw =
    selectorAllowed ||
    (runtimeMode === 'extension-local' &&
      config.privacy?.textInputMode === 'raw' &&
      config.privacy.clearTextAllowInExtension);

  if (sensitive && !selectorAllowed) {
    return createResult(
      {
        mode: 'omitted',
        length: rawValue.length
      },
      'redacted',
      true,
      true,
      denylistRules,
    );
  }

  if (element instanceof HTMLSelectElement) {
    return createResult(
      {
        mode: safeForRaw ? 'raw' : 'masked',
        raw: safeForRaw ? rawValue : undefined,
        masked: safeForRaw ? undefined : maskValue(rawValue),
        length: rawValue.length
      },
      'option',
      !safeForRaw,
      false,
      denylistRules,
    );
  }

  const configuredMode = safeForRaw ? 'raw' : config.privacy?.textInputMode ?? 'masked';
  switch (configuredMode) {
    case 'raw':
      return createResult(
        {
          mode: 'raw',
          raw: rawValue,
          length: rawValue.length
        },
        inferKind(element, rawValue),
        false,
        false,
        denylistRules,
      );
    case 'hashed':
      return createResult(
        {
          mode: 'hashed',
          hash: simpleHash(rawValue),
          length: rawValue.length
        },
        'redacted',
        true,
        false,
        denylistRules,
      );
    case 'omitted':
      return createResult(
        {
          mode: 'omitted',
          length: rawValue.length
        },
        'redacted',
        true,
        false,
        denylistRules,
      );
    case 'masked':
    default:
      return createResult(
        {
          mode: 'masked',
          masked: maskValue(rawValue),
          length: rawValue.length
        },
        'redacted',
        true,
        false,
        denylistRules,
      );
  }
}

function getRawValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | null {
  if (element instanceof HTMLSelectElement) {
    return normalizeText(element.value, 200);
  }
  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
    return String(element.checked);
  }
  return normalizeText(element.value, 200);
}

function inferKind(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  rawValue: string,
): RedactionResult['valueKind'] {
  if (element instanceof HTMLSelectElement) {
    return 'option';
  }

  if (element instanceof HTMLInputElement && element.type === 'number') {
    return 'number';
  }

  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
    return 'boolean';
  }

  return rawValue.length > 0 ? 'text' : 'none';
}

function createResult(
  capturedValue: CapturedValue | null,
  valueKind: RedactionResult['valueKind'],
  redacted: boolean,
  containsSensitiveTarget: boolean,
  rulesApplied: string[],
): RedactionResult {
  return {
    capturedValue,
    valueKind,
    redaction: {
      redacted,
      value_mode: capturedValue?.mode ?? 'omitted',
      rules_applied: rulesApplied,
      contains_sensitive_target: containsSensitiveTarget
    }
  };
}
