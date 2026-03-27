export type RuntimeMode = 'gtm' | 'extension-local';
export type SnapshotMode = 'off' | 'balanced' | 'enhanced-local';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportMetadata {
  width: number;
  height: number;
  scroll_x: number;
  scroll_y: number;
  dpr: number;
}

export interface SelectorCandidate {
  strategy:
    | 'data-testid'
    | 'data-test'
    | 'data-qa'
    | 'data-cy'
    | 'id'
    | 'name'
    | 'aria-role-name'
    | 'label-text'
    | 'placeholder'
    | 'href'
    | 'text'
    | 'css'
    | 'xpath'
    | 'dom-path';
  value: string;
  confidence: number;
  stable: boolean;
  rationale: string;
}

export interface ContainerIdentity {
  kind:
    | 'form'
    | 'landmark'
    | 'dialog'
    | 'drawer'
    | 'region'
    | 'list'
    | 'table'
    | 'grid'
    | 'card'
    | 'scroll-container';
  dom_ref?: string;
  label?: string | null;
  text_snippet?: string | null;
  selector_candidates?: SelectorCandidate[];
}

export interface AncestryNodeSummary {
  tag_name: string | null;
  role?: string | null;
  id_attr?: string | null;
  class_list?: string[];
  accessible_name?: string | null;
}

export interface CapturedValue {
  mode: 'raw' | 'masked' | 'hashed' | 'omitted';
  raw?: string;
  masked?: string;
  hash?: string;
  length?: number;
}

export interface RedactionMetadata {
  redacted: boolean;
  value_mode: CapturedValue['mode'];
  rules_applied: string[];
  contains_sensitive_target: boolean;
}

export interface TargetMetadata {
  tag_name: string | null;
  node_name: string | null;
  input_type?: string | null;
  role?: string | null;
  accessible_name?: string | null;
  text_snippet?: string | null;
  aria_label?: string | null;
  placeholder?: string | null;
  name_attr?: string | null;
  id_attr?: string | null;
  class_list?: string[];
  href?: string | null;
  value_kind?: 'none' | 'text' | 'number' | 'boolean' | 'option' | 'redacted';
  checked?: boolean | null;
  disabled?: boolean | null;
  read_only?: boolean | null;
  bounding_box?: BoundingBox | null;
  center_point?: { x: number; y: number } | null;
  in_viewport?: boolean | null;
  iframe_path?: string[];
  shadow_dom_path?: string[];
  ancestry_summary?: AncestryNodeSummary[];
  nearest_form?: ContainerIdentity | null;
  nearest_landmark?: ContainerIdentity | null;
  nearest_heading?: string | null;
  nearest_label_text?: string | null;
  nearest_container?: ContainerIdentity | null;
  scroll_container?: ContainerIdentity | null;
}

export interface VisibleContextItem {
  dom_ref: string;
  tag_name: string;
  role?: string | null;
  accessible_name?: string | null;
  text_snippet?: string | null;
  bounding_box: BoundingBox;
  visibility_ratio?: number;
  interactive: boolean;
  landmark?: string | null;
  selector_candidates?: SelectorCandidate[];
}

export interface VisibleContextSnapshot {
  captured_at_unix_ms: number;
  items: VisibleContextItem[];
  active_dialogs: VisibleContextItem[];
  active_drawers: VisibleContextItem[];
  top_headings: string[];
  focused_dom_ref?: string | null;
  landmark_stack?: string[];
}

export type ReplayWaitHint =
  | { type: 'route-change' }
  | { type: 'navigation-complete' }
  | { type: 'dom-quiet'; ms: number }
  | { type: 'network-idle'; ms: number }
  | { type: 'element-visible'; selector: string }
  | { type: 'element-hidden'; selector: string }
  | { type: 'dialog-opened' }
  | { type: 'toast-visible' };

export interface ReplayHints {
  suggested_waits: ReplayWaitHint[];
  target_settled_state_id?: string | null;
  likely_view_key?: string | null;
  inside_modal?: boolean;
  inside_drawer?: boolean;
  required_scroll?: boolean;
  same_origin_iframe?: boolean;
  open_shadow_root?: boolean;
  async_render_suspected?: boolean;
}

export interface NetworkRecord {
  request_id: string;
  method: string;
  sanitized_url: string;
  started_at_unix_ms: number;
  ended_at_unix_ms?: number;
  duration_ms?: number;
  status?: number | null;
  result: 'pending' | 'success' | 'failure' | 'abort';
  initiator?: string | null;
}

export interface SnapshotFragment {
  label: string;
  dom_ref?: string;
  outer_html: string;
}

export interface StateSnapshot {
  snapshot_id: string;
  state_id: string;
  created_at_unix_ms: number;
  level: SnapshotMode;
  dom_signature: string;
  route_template_guess?: string | null;
  dominant_container_signature?: string | null;
  top_heading?: string | null;
  active_landmarks: string[];
  modal_identity?: string | null;
  form_identity?: string | null;
  visible_context: VisibleContextSnapshot;
  fragments: SnapshotFragment[];
}

export interface RecorderDiagnostics {
  dropped_events_count: number;
  redacted_values_count: number;
  queue_overflow_count: number;
  last_transport_error: string | null;
  average_snapshot_size: number;
}

export interface BaseEvent {
  event_id: string;
  session_id: string;
  visitor_id: string;
  pageview_id: string;
  tab_id: string | null;
  route_id: string;
  state_id: string | null;
  ts_unix_ms: number;
  ts_perf_ms: number;
  sequence_no: number;
  mode: RuntimeMode;
  url: string;
  url_path: string;
  url_hash: string;
  title: string;
  referrer: string | null;
  viewport: ViewportMetadata;
  document_ready_state: string;
  visibility_state: string;
}

export type EventCategory = 'user' | 'navigation' | 'system';

export interface NormalizedEvent extends BaseEvent {
  event_type: string;
  category: EventCategory;
  action_kind?: string | null;
  target?: TargetMetadata | null;
  selectors?: SelectorCandidate[];
  visible_context?: VisibleContextSnapshot | null;
  replay_hints?: ReplayHints | null;
  captured_value?: CapturedValue | null;
  redaction?: RedactionMetadata | null;
  network?: NetworkRecord | null;
  snapshot_ref?: Pick<StateSnapshot, 'snapshot_id' | 'state_id'> | null;
  state_id_after?: string | null;
  ancestry_summary?: AncestryNodeSummary[];
  nearest_form?: ContainerIdentity | null;
  nearest_landmark?: ContainerIdentity | null;
  nearest_heading?: string | null;
  nearest_label_text?: string | null;
  dominant_container_signature?: string | null;
  route_template_guess?: string | null;
  notes?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SessionMetadata {
  app_id?: string;
  visitor_id: string;
  session_id: string;
  pageview_id: string;
  route_id: string;
  state_id: string | null;
  tab_id: string | null;
  mode: RuntimeMode;
  started_at_unix_ms: number;
  current_url: string;
}

export interface TransportBatch {
  batch_id: string;
  app_id?: string;
  endpoint?: string;
  mode: RuntimeMode;
  sent_at_unix_ms: number;
  session: SessionMetadata;
  events: NormalizedEvent[];
}

export interface ExportedSession {
  exported_at_unix_ms: number;
  app_id?: string;
  mode: RuntimeMode;
  session: SessionMetadata;
  diagnostics: RecorderDiagnostics;
  snapshots: StateSnapshot[];
  events: NormalizedEvent[];
}

export interface RecorderConfig {
  endpoint: string;
  appId?: string;
  mode?: RuntimeMode;
  autoStart?: boolean;
  debug?: boolean;
  sessionTimeoutMs?: number;
  identity?: {
    strategy?: 'anonymous-id';
    storage?: 'localStorage' | 'cookie' | 'memory';
    cookieName?: string;
    cookieMaxAgeDays?: number;
    cookieEnabled?: boolean;
  };
  capture?: {
    clicks?: boolean;
    inputs?: boolean;
    keyboard?: boolean;
    scroll?:
      | boolean
      | {
          throttleMs?: number;
          idleMs?: number;
        };
    network?: boolean;
    visibilityContext?: boolean;
    snapshots?: SnapshotMode;
  };
  privacy?: {
    textInputMode?: 'masked' | 'hashed' | 'omitted' | 'raw';
    allowlistSelectors?: string[];
    denylistSelectors?: string[];
    denylistFieldNamePatterns?: string[];
    inputTypeDenylist?: string[];
    redactQueryParams?: string[];
    clearTextAllowInExtension?: boolean;
  };
  transport?: {
    batchSize?: number;
    flushIntervalMs?: number;
    maxQueueSize?: number;
    retryBackoffMs?: number[];
    sendBeaconOnHidden?: boolean;
  };
  network?: {
    sameOriginOnly?: boolean;
    allowlist?: string[];
    denylist?: string[];
    attachToActionEvents?: boolean;
    redactQueryParams?: string[];
  };
  settling?: {
    domQuietMs?: number;
    networkIdleMs?: number;
    maxSettleWaitMs?: number;
  };
  extension?: {
    bridgeChannel?: string;
    tabId?: string | null;
  };
}

export interface RecorderRuntimeState {
  started: boolean;
  mode: RuntimeMode;
  event_count: number;
  queue_size: number;
  current_url: string;
  session: SessionMetadata;
  diagnostics: RecorderDiagnostics;
  latest_snapshot_id?: string | null;
  session_export: ExportedSession;
}

export const recorderBatchJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://flow-recorder.dev/schema/transport-batch.json',
  type: 'object',
  required: ['batch_id', 'mode', 'sent_at_unix_ms', 'session', 'events'],
  properties: {
    batch_id: { type: 'string' },
    app_id: { type: 'string' },
    endpoint: { type: 'string' },
    mode: { enum: ['gtm', 'extension-local'] },
    sent_at_unix_ms: { type: 'number' },
    session: {
      type: 'object',
      required: [
        'visitor_id',
        'session_id',
        'pageview_id',
        'route_id',
        'mode',
        'started_at_unix_ms',
        'current_url'
      ],
      properties: {
        visitor_id: { type: 'string' },
        session_id: { type: 'string' },
        pageview_id: { type: 'string' },
        route_id: { type: 'string' },
        state_id: { type: ['string', 'null'] },
        tab_id: { type: ['string', 'null'] },
        mode: { enum: ['gtm', 'extension-local'] },
        started_at_unix_ms: { type: 'number' },
        current_url: { type: 'string' }
      }
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'event_id',
          'event_type',
          'category',
          'session_id',
          'visitor_id',
          'pageview_id',
          'route_id',
          'ts_unix_ms',
          'ts_perf_ms',
          'sequence_no',
          'mode',
          'url',
          'url_path',
          'url_hash',
          'title',
          'viewport',
          'document_ready_state',
          'visibility_state'
        ],
        properties: {
          event_id: { type: 'string' },
          event_type: { type: 'string' },
          category: { enum: ['user', 'navigation', 'system'] },
          session_id: { type: 'string' },
          visitor_id: { type: 'string' },
          pageview_id: { type: 'string' },
          route_id: { type: 'string' },
          state_id: { type: ['string', 'null'] },
          ts_unix_ms: { type: 'number' },
          ts_perf_ms: { type: 'number' },
          sequence_no: { type: 'number' },
          mode: { enum: ['gtm', 'extension-local'] },
          url: { type: 'string' }
        }
      }
    }
  }
} as const;
