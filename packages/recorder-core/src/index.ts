import type {
  ExportedSession,
  NetworkRecord,
  NormalizedEvent,
  RecorderConfig,
  RecorderDiagnostics,
  RecorderRuntimeState,
  RuntimeMode
} from '@flow-recorder/schema';
import { NoopTransport, type EventTransport } from '@flow-recorder/transport';

import { IdentityManager } from './identity-manager';
import { NetworkTracker } from './network-tracker';
import { QueueManager } from './queue-manager';
import { captureElementValue } from './redaction-engine';
import { guessRouteTemplate, RouteTracker, type RouteChange } from './route-tracker';
import { ScrollAggregator } from './scroll-aggregator';
import { createStateSnapshot } from './snapshot-manager';
import { StateSettlementManager } from './state-settlement-manager';
import {
  buildTargetMetadata,
  captureVisibleContext,
  dominantContainerSignature,
  DomRefRegistry
} from './visibility-context';
import {
  createIdFactory,
  DEFAULT_CONFIG,
  getViewport,
  mergeRecorderConfig,
  sanitizeUrl
} from './utils';

export interface Recorder {
  start(config?: RecorderConfig): void;
  stop(): void;
  flush(reason?: string): Promise<void>;
  getState(): RecorderRuntimeState;
  updateConfig(patch: Partial<RecorderConfig>): void;
}

export interface RecorderDependencies {
  win: Window;
  doc: Document;
  console: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  now: () => number;
  perfNow: () => number;
  generateId: () => string;
  transport: EventTransport;
  transportFactory: (config: RecorderConfig) => EventTransport;
}

export {
  IdentityManager,
  QueueManager,
  RouteTracker,
  ScrollAggregator,
  StateSettlementManager,
  DomRefRegistry,
  captureElementValue,
  guessRouteTemplate
};

const USER_EVENTS = [
  'click',
  'dblclick',
  'contextmenu',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'keydown',
  'keyup',
  'input',
  'change',
  'focus',
  'blur',
  'submit',
  'wheel',
  'dragstart',
  'drop'
] as const;

export function createRecorder(deps: Partial<RecorderDependencies> = {}): Recorder {
  const win = deps.win ?? window;
  const doc = deps.doc ?? document;
  const logger = deps.console ?? console;
  const now = deps.now ?? (() => Date.now());
  const perfNow = deps.perfNow ?? (() => performance.now());
  const generateId = deps.generateId ?? createIdFactory(win.crypto);

  let config = mergeRecorderConfig(DEFAULT_CONFIG, undefined);
  let transport = deps.transport ?? deps.transportFactory?.(config) ?? new NoopTransport();
  let started = false;
  let sequenceNo = 0;
  let currentTargetForSnapshot: Element | null = null;
  let lastCompletedNetwork: NetworkRecord | null = null;
  let cleanupFns: Array<() => void> = [];
  let mutationObserver: MutationObserver | null = null;
  let mutationBurstTimer: ReturnType<typeof setTimeout> | null = null;
  let mutationBurstCount = 0;
  const domRefs = new DomRefRegistry();
  const diagnostics: RecorderDiagnostics = {
    dropped_events_count: 0,
    redacted_values_count: 0,
    queue_overflow_count: 0,
    last_transport_error: null,
    average_snapshot_size: 0
  };
  const snapshots = new Array<NonNullable<RecorderRuntimeState['session_export']>['snapshots'][number]>();
  const recordedEvents: NormalizedEvent[] = [];

  const identityManager = new IdentityManager({
    win,
    now,
    generateId,
    config
  });

  const queueManager = new QueueManager(transport, {
    batchSize: config.transport?.batchSize ?? 20,
    flushIntervalMs: config.transport?.flushIntervalMs ?? 3000,
    maxQueueSize: config.transport?.maxQueueSize ?? 500,
    createBatch: (events) => ({
      batch_id: generateId(),
      app_id: config.appId,
      endpoint: config.endpoint,
      mode: resolveMode(config),
      sent_at_unix_ms: now(),
      session: identityManager.createSessionMetadata(resolveMode(config), win.location.href, config.appId),
      events
    }),
    onOverflow: () => {
      diagnostics.queue_overflow_count += 1;
      diagnostics.dropped_events_count += 1;
    },
    onTransportError: (error) => {
      diagnostics.last_transport_error = error.message;
      logger.warn('[flow-recorder] transport error', error);
    }
  });

  const settlementManager = new StateSettlementManager({
    domQuietMs: config.settling?.domQuietMs ?? 400,
    networkIdleMs: config.settling?.networkIdleMs ?? 300,
    maxSettleWaitMs: config.settling?.maxSettleWaitMs ?? 5000,
    now,
    getInFlightRequests: () => networkTracker.getInFlightCount(),
    onSettlingStart: (reason) => {
      emitEvent('state.settling.start', 'system', null, {
        notes: [reason]
      });
    },
    onSettled: (result) => {
      const nextStateId = identityManager.rotateState();
      const visibleContext = config.capture?.visibilityContext
        ? captureVisibleContext(doc, domRefs)
        : null;
      const snapshot = createStateSnapshot({
        doc,
        level: config.capture?.snapshots ?? 'balanced',
        stateId: nextStateId,
        target: currentTargetForSnapshot,
        visibleContext: visibleContext ?? captureVisibleContext(doc, domRefs),
        registry: domRefs,
        generateId
      });

      if (snapshot) {
        snapshots.push(snapshot);
        diagnostics.average_snapshot_size =
          snapshots.reduce((total, item) => total + JSON.stringify(item).length, 0) / snapshots.length;
      }

      emitEvent('state.settled', 'system', null, {
        visible_context: visibleContext,
        state_id_after: nextStateId,
        replay_hints: {
          suggested_waits: [
            { type: 'dom-quiet', ms: config.settling?.domQuietMs ?? 400 },
            { type: 'network-idle', ms: config.settling?.networkIdleMs ?? 300 }
          ],
          target_settled_state_id: nextStateId,
          likely_view_key: snapshot?.dom_signature ?? null
        },
        snapshot_ref: snapshot
          ? {
              snapshot_id: snapshot.snapshot_id,
              state_id: snapshot.state_id
            }
          : null,
        metadata: {
          settle_reason: result.reason
        }
      });

      if (snapshot) {
        emitEvent('state.snapshot.created', 'system', null, {
          snapshot_ref: {
            snapshot_id: snapshot.snapshot_id,
            state_id: snapshot.state_id
          },
          visible_context: snapshot.visible_context,
          metadata: {
            snapshot_level: snapshot.level,
            dom_signature: snapshot.dom_signature
          }
        });
      }
    }
  });

  const networkTracker = new NetworkTracker({
    win,
    config,
    now,
    generateId,
    onRequestStart: (record) => {
      settlementManager.noteNetworkStart();
      if (config.capture?.network) {
        emitEvent('network.request.start', 'system', null, { network: record });
      }
    },
    onRequestEnd: (record) => {
      lastCompletedNetwork = record;
      settlementManager.noteNetworkEnd();
      if (config.capture?.network) {
        emitEvent('network.request.end', 'system', null, { network: record });
      }
      settlementManager.markDirty('network-complete');
    }
  });

  const scrollAggregator = new ScrollAggregator({
    throttleMs: typeof config.capture?.scroll === 'object' ? config.capture.scroll.throttleMs ?? 180 : 180,
    idleMs: typeof config.capture?.scroll === 'object' ? config.capture.scroll.idleMs ?? 180 : 180,
    now,
    onEmit: (scrollEvent) => {
      const target = scrollEvent.target instanceof HTMLElement ? scrollEvent.target : null;
      currentTargetForSnapshot = target;
      emitEvent(scrollEvent.eventType, 'user', target, {
        action_kind: 'action.scroll',
        visible_context:
          scrollEvent.eventType === 'scroll.end' && config.capture?.visibilityContext
            ? captureVisibleContext(doc, domRefs)
            : null,
        metadata: {
          scroll_x: scrollEvent.scrollX,
          scroll_y: scrollEvent.scrollY,
          percent_x: Number(scrollEvent.percentX.toFixed(3)),
          percent_y: Number(scrollEvent.percentY.toFixed(3))
        }
      });
      if (scrollEvent.eventType === 'scroll.end') {
        settlementManager.markDirty('scroll-complete');
      }
    }
  });

  const routeTracker = new RouteTracker(win, (change) => {
    handleRouteChange(change);
  });

  function start(startConfig?: RecorderConfig): void {
    if (startConfig) {
      config = mergeRecorderConfig(config, startConfig);
      identityManager.updateConfig(config);
      refreshTransport();
    }

    if (started) {
      return;
    }

    started = true;
    attachUserListeners();
    attachMutationObserver();
    attachVisibilityFlush();
    if (config.capture?.network) {
      networkTracker.start();
    }
    routeTracker.start();
    debug('recorder started', resolveMode(config));
  }

  function stop(): void {
    if (!started) {
      return;
    }

    started = false;
    for (const dispose of cleanupFns.splice(0)) {
      dispose();
    }
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (mutationBurstTimer) {
      clearTimeout(mutationBurstTimer);
      mutationBurstTimer = null;
    }
    settlementManager.stop();
    routeTracker.stop();
    networkTracker.stop();
    scrollAggregator.stop();
    queueManager.stop();
    void queueManager.flush('stop');
    debug('recorder stopped');
  }

  async function flush(reason = 'manual'): Promise<void> {
    await queueManager.flush(reason);
  }

  function getState(): RecorderRuntimeState {
    const session = identityManager.createSessionMetadata(resolveMode(config), win.location.href, config.appId);
    const sessionExport: ExportedSession = {
      exported_at_unix_ms: now(),
      app_id: config.appId,
      mode: resolveMode(config),
      session,
      diagnostics: { ...diagnostics },
      snapshots: [...snapshots],
      events: [...recordedEvents]
    };

    return {
      started,
      mode: resolveMode(config),
      event_count: recordedEvents.length,
      queue_size: queueManager.getQueueSize(),
      current_url: win.location.href,
      session,
      diagnostics: { ...diagnostics },
      latest_snapshot_id: snapshots.at(-1)?.snapshot_id ?? null,
      session_export: sessionExport
    };
  }

  function updateConfig(patch: Partial<RecorderConfig>): void {
    config = mergeRecorderConfig(config, patch);
    identityManager.updateConfig(config);
    refreshTransport();
  }

  function refreshTransport(): void {
    transport = deps.transport ?? deps.transportFactory?.(config) ?? new NoopTransport();
    queueManager.setTransport(transport);
  }

  function attachUserListeners(): void {
    for (const eventName of USER_EVENTS) {
      const handler = (event: Event): void => {
        handleUserEvent(event);
      };
      const usePassive = eventName === 'wheel';
      doc.addEventListener(eventName, handler, { capture: true, passive: usePassive });
      cleanupFns.push(() => doc.removeEventListener(eventName, handler, { capture: true }));
    }

    if (config.capture?.scroll) {
      const scrollHandler = (event: Event): void => {
        scrollAggregator.handle(event.target);
      };
      doc.addEventListener('scroll', scrollHandler, { capture: true, passive: true });
      cleanupFns.push(() => doc.removeEventListener('scroll', scrollHandler, { capture: true }));
    }
  }

  function attachMutationObserver(): void {
    if (!doc.documentElement) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      const meaningful = mutations.filter(
        (mutation) =>
          mutation.type === 'childList' ||
          (mutation.type === 'attributes' && mutation.attributeName !== 'style'),
      );

      if (meaningful.length === 0) {
        return;
      }

      mutationBurstCount += meaningful.length;
      settlementManager.markDirty('dom-mutation');
      if (mutationBurstTimer) {
        return;
      }

      mutationBurstTimer = window.setTimeout(() => {
        emitEvent('dom.mutation.burst', 'system', null, {
          metadata: {
            mutation_count: mutationBurstCount
          }
        });
        mutationBurstCount = 0;
        mutationBurstTimer = null;
      }, 120);
    });

    mutationObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  function attachVisibilityFlush(): void {
    const handleHidden = (): void => {
      if (doc.visibilityState === 'hidden' && config.transport?.sendBeaconOnHidden) {
        void flush('hidden');
      }
    };
    doc.addEventListener('visibilitychange', handleHidden);
    cleanupFns.push(() => doc.removeEventListener('visibilitychange', handleHidden));
  }

  function handleRouteChange(change: RouteChange): void {
    if (change.eventType === 'document.load' || change.eventType === 'route.change') {
      identityManager.rotateRoute();
      settlementManager.markDirty(change.eventType);
    }

    emitEvent(change.eventType, 'navigation', null, {
      route_template_guess: guessRouteTemplate(change.path),
      metadata: {
        url: sanitizeUrl(change.url, config.privacy?.redactQueryParams ?? []),
        title: change.title,
        hash: change.hash
      }
    });
  }

  function handleUserEvent(event: Event): void {
    try {
      identityManager.touch();
      const target = event.target instanceof Element ? event.target : null;
      currentTargetForSnapshot = target;
      const eventType = event.type;
      const capture = shouldCaptureEvent(eventType);
      if (!capture) {
        return;
      }

      const visibleContext = config.capture?.visibilityContext ? captureVisibleContext(doc, domRefs) : null;
      const targetBundle = target ? buildTargetMetadata(target, domRefs) : null;
      const valueCapture =
        target && ['input', 'change'].includes(eventType)
          ? captureElementValue(target, config, resolveMode(config))
          : null;
      if (valueCapture?.redaction.redacted) {
        diagnostics.redacted_values_count += 1;
      }

      const metadata = buildEventMetadata(event);
      const actionKind = mapActionKind(eventType, target);
      const eventRecord = emitEvent(eventType, 'user', target, {
        action_kind: actionKind,
        target: targetBundle?.target,
        selectors: targetBundle?.selectors,
        visible_context: visibleContext,
        replay_hints: target
          ? {
              suggested_waits: likelyMutatesUi(eventType, target)
                ? [
                    { type: 'dom-quiet', ms: config.settling?.domQuietMs ?? 400 },
                    { type: 'network-idle', ms: config.settling?.networkIdleMs ?? 300 }
                  ]
                : [],
              inside_modal: Boolean(target.closest('dialog, [role="dialog"], [aria-modal="true"]')),
              inside_drawer: Boolean(target.closest('[data-drawer], .drawer, .sheet')),
              required_scroll: targetBundle?.target.in_viewport === false,
              same_origin_iframe: targetBundle?.target.iframe_path?.length ? true : false,
              open_shadow_root: (targetBundle?.target.shadow_dom_path?.length ?? 0) > 0
            }
          : null,
        captured_value: valueCapture?.capturedValue ?? null,
        redaction: valueCapture?.redaction ?? null,
        ancestry_summary: targetBundle?.target.ancestry_summary,
        nearest_form: targetBundle?.target.nearest_form ?? null,
        nearest_landmark: targetBundle?.target.nearest_landmark ?? null,
        nearest_heading: targetBundle?.target.nearest_heading ?? null,
        nearest_label_text: targetBundle?.target.nearest_label_text ?? null,
        dominant_container_signature: dominantContainerSignature(target),
        route_template_guess: guessRouteTemplate(win.location.pathname),
        metadata
      });

      if (config.network?.attachToActionEvents && lastCompletedNetwork) {
        eventRecord.network = lastCompletedNetwork;
      }

      if (likelyMutatesUi(eventType, target)) {
        settlementManager.markDirty(actionKind ?? eventType);
      }
    } catch (error) {
      logger.error('[flow-recorder] event handling failed', error);
    }
  }

  function emitEvent(
    eventType: string,
    category: NormalizedEvent['category'],
    targetElement: Element | null,
    overrides: Partial<NormalizedEvent> = {},
  ): NormalizedEvent {
    const ids = identityManager.getCurrentIds();
    const eventRecord: NormalizedEvent = {
      event_id: generateId(),
      event_type: eventType,
      category,
      session_id: ids.sessionId,
      visitor_id: ids.visitorId,
      pageview_id: ids.pageviewId,
      tab_id: ids.tabId,
      route_id: ids.routeId,
      state_id: ids.stateId,
      ts_unix_ms: now(),
      ts_perf_ms: perfNow(),
      sequence_no: ++sequenceNo,
      mode: resolveMode(config),
      url: sanitizeUrl(win.location.href, config.privacy?.redactQueryParams ?? []),
      url_path: win.location.pathname,
      url_hash: win.location.hash,
      title: doc.title,
      referrer: doc.referrer || null,
      viewport: getViewport(win),
      document_ready_state: doc.readyState,
      visibility_state: doc.visibilityState,
      action_kind: overrides.action_kind ?? null,
      target: overrides.target ?? null,
      selectors: overrides.selectors ?? [],
      visible_context: overrides.visible_context ?? null,
      replay_hints: overrides.replay_hints ?? null,
      captured_value: overrides.captured_value ?? null,
      redaction: overrides.redaction ?? null,
      network: overrides.network ?? null,
      snapshot_ref: overrides.snapshot_ref ?? null,
      state_id_after: overrides.state_id_after ?? null,
      ancestry_summary: overrides.ancestry_summary ?? undefined,
      nearest_form: overrides.nearest_form ?? null,
      nearest_landmark: overrides.nearest_landmark ?? null,
      nearest_heading: overrides.nearest_heading ?? null,
      nearest_label_text: overrides.nearest_label_text ?? null,
      dominant_container_signature:
        overrides.dominant_container_signature ?? dominantContainerSignature(targetElement),
      route_template_guess: overrides.route_template_guess ?? guessRouteTemplate(win.location.pathname),
      notes: overrides.notes ?? [],
      metadata: overrides.metadata ?? {}
    };

    recordedEvents.push(eventRecord);
    queueManager.enqueue(eventRecord);
    debug('event', eventType, eventRecord);
    return eventRecord;
  }

  function debug(...args: unknown[]): void {
    if (config.debug) {
      logger.debug('[flow-recorder]', ...args);
    }
  }

  return {
    start,
    stop,
    flush,
    getState,
    updateConfig
  };
}

function resolveMode(config: RecorderConfig): RuntimeMode {
  return config.mode ?? 'gtm';
}

function shouldCaptureEvent(eventType: string): boolean {
  return USER_EVENTS.includes(eventType as (typeof USER_EVENTS)[number]);
}

function likelyMutatesUi(eventType: string, target: Element | null): boolean {
  if (!target) {
    return false;
  }

  if (['input', 'change', 'submit', 'drop', 'dragstart'].includes(eventType)) {
    return true;
  }

  if (eventType === 'click') {
    return Boolean(
      target.closest(
        'button, a[href], [role="button"], [role="tab"], [data-action], input[type="checkbox"], input[type="radio"]',
      ),
    );
  }

  return ['dblclick', 'contextmenu'].includes(eventType);
}

function mapActionKind(eventType: string, target: Element | null): string | null {
  switch (eventType) {
    case 'click':
    case 'dblclick':
    case 'contextmenu':
      return 'action.click';
    case 'input':
      return 'action.type';
    case 'change':
      if (target instanceof HTMLSelectElement) {
        return 'action.select';
      }
      if (target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(target.type)) {
        return 'action.toggle';
      }
      return 'action.change';
    case 'submit':
      return 'action.submit';
    case 'keydown':
    case 'keyup':
      return 'action.key';
    case 'focus':
    case 'blur':
      return 'action.focus';
    case 'dragstart':
    case 'drop':
      return 'action.drag';
    case 'wheel':
      return 'action.scroll';
    default:
      return `action.${eventType}`;
  }
}

function buildEventMetadata(event: Event): Record<string, string | number | boolean | null> {
  if (event instanceof MouseEvent) {
    return {
      client_x: event.clientX,
      client_y: event.clientY,
      button: event.button
    };
  }

  if (event instanceof KeyboardEvent) {
    return {
      key: event.key,
      code: event.code,
      alt_key: event.altKey,
      ctrl_key: event.ctrlKey,
      meta_key: event.metaKey,
      shift_key: event.shiftKey
    };
  }

  if (event instanceof SubmitEvent) {
    return {
      submitter_tag: event.submitter?.tagName.toLowerCase() ?? null
    };
  }

  return {};
}
