import { installGlobalFlowRecorder } from '@flow-recorder/sdk-browser';

type RouteKey = 'home' | 'forms' | 'lists';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing app root');
}

installGlobalFlowRecorder(window);

const state = {
  route: readRoute(),
  modalOpen: false,
  drawerOpen: false,
  loadingFeed: false,
  feedPage: 1,
  feedItems: [] as Array<{ id: number; title: string; body: string }>,
  toasts: [] as string[]
};

renderShell();
void hydrateFeed();
window.addEventListener('popstate', () => {
  state.route = readRoute();
  renderContent();
  renderLiveStatus();
});

function renderShell(): void {
  app.innerHTML = `
    <div class="shell">
      <section class="hero">
        <div class="hero-copy">
          <span class="tag">Demo SPA</span>
          <h1>Dynamic flows with async state, overlays, and real route changes.</h1>
          <p>
            Use this page to validate GTM-like injection and extension-local injection against
            the same recorder core.
          </p>
          <div class="toolbar">
            <button id="init-recorder">Init GTM-like recorder</button>
            <button id="stop-recorder" class="secondary">Stop recorder</button>
            <button id="export-recorder" class="secondary">Export session to console</button>
          </div>
          <nav class="pill-nav" aria-label="Demo routes">
            <button class="link-button secondary" data-route="home">Home</button>
            <button class="link-button secondary" data-route="forms">Forms</button>
            <button class="link-button secondary" data-route="lists">Async list</button>
          </nav>
        </div>
        <aside class="hero-card">
          <h2>Why this page exists</h2>
          <p>
            The page mixes pushState navigation, delayed mutations, modal and drawer lifecycles,
            redaction-sensitive inputs, and scrollable containers so recorder fixtures are not toy examples.
          </p>
        </aside>
      </section>

      <div class="layout">
        <section id="content-region" class="surface"></section>
        <aside class="panel">
          <h3>Session controls</h3>
          <p>
            Buttons below trigger async fetches, delayed DOM updates, and overlay changes that should
            produce route and state transitions.
          </p>
          <div class="toolbar">
            <button id="open-modal">Open modal</button>
            <button id="open-drawer" class="secondary">Open drawer</button>
            <button id="load-feed" class="secondary">Load more content</button>
          </div>
          <div id="live-status"></div>
        </aside>
      </div>
    </div>
    <div id="toast-stack" class="toast-stack"></div>
    <div id="modal-layer" class="modal-layer" hidden></div>
    <div id="drawer-layer" class="drawer-layer" hidden></div>
  `;

  wireShellEvents();
  renderContent();
  renderLiveStatus();
}

function wireShellEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route as RouteKey;
      navigate(route);
    });
  });

  document.getElementById('init-recorder')?.addEventListener('click', () => {
    window.FlowRecorder.init({
      endpoint: '',
      appId: 'demo-spa',
      mode: 'gtm',
      autoStart: true,
      debug: true,
      capture: {
        visibilityContext: true,
        snapshots: 'balanced',
        network: true,
        scroll: {
          throttleMs: 180,
          idleMs: 180
        }
      }
    });
    pushToast('Recorder started in GTM mode.');
    renderLiveStatus();
  });

  document.getElementById('stop-recorder')?.addEventListener('click', () => {
    window.FlowRecorder.stop();
    pushToast('Recorder stopped.');
    renderLiveStatus();
  });

  document.getElementById('export-recorder')?.addEventListener('click', () => {
    console.info('flow-recorder export', window.FlowRecorder.exportSession());
    pushToast('Exported session logged to console.');
    renderLiveStatus();
  });

  document.getElementById('open-modal')?.addEventListener('click', () => {
    setTimeout(() => {
      state.modalOpen = true;
      renderModal();
      pushToast('Modal opened after delayed mutation.');
    }, 220);
  });

  document.getElementById('open-drawer')?.addEventListener('click', async () => {
    await simulateFetch({ drawer: true }, 250);
    state.drawerOpen = true;
    renderDrawer();
  });

  document.getElementById('load-feed')?.addEventListener('click', () => {
    void hydrateFeed();
  });
}

function renderContent(): void {
  const content = document.getElementById('content-region');
  if (!content) {
    return;
  }

  if (state.route === 'forms') {
    content.innerHTML = renderFormsRoute();
    bindFormRoute();
  } else if (state.route === 'lists') {
    content.innerHTML = renderListRoute();
    bindListRoute();
  } else {
    content.innerHTML = renderHomeRoute();
    bindHomeRoute();
  }
}

function renderHomeRoute(): string {
  return `
    <span class="tag">Home route</span>
    <h2>State boundaries on clicks, overlays, and route switches</h2>
    <p>
      Use these cards to trigger route changes and delayed element appearance. The recorder should
      observe meaningful DOM bursts instead of only raw browser events.
    </p>
    <div class="metrics">
      <article class="metric">
        <span>Route</span>
        <strong>${state.route}</strong>
      </article>
      <article class="metric">
        <span>Feed cards</span>
        <strong>${state.feedItems.length}</strong>
      </article>
      <article class="metric">
        <span>Toasts</span>
        <strong>${state.toasts.length}</strong>
      </article>
    </div>
    <div class="grid">
      <article class="feed-card">
        <h3>Profile setup</h3>
        <p>Jump into the forms route, fill fields, and submit to produce redaction-aware value events.</p>
        <button data-route-action="forms">Go to forms</button>
      </article>
      <article class="feed-card">
        <h3>Async catalog</h3>
        <p>Trigger fetch-backed list updates and scroll the feed container to generate scroll start and end markers.</p>
        <button data-route-action="lists">Go to async list</button>
      </article>
      <article class="feed-card">
        <h3>Delayed CTA</h3>
        <p>Reveal a hidden card after a network-like pause.</p>
        <button id="reveal-cta">Reveal card</button>
        <div id="delayed-cta-slot"></div>
      </article>
    </div>
  `;
}

function renderFormsRoute(): string {
  return `
    <span class="tag">Forms route</span>
    <h2>Mask-by-default inputs with explicit submit flow</h2>
    <form id="signup-form">
      <div class="form-grid">
        <label>
          Work email
          <input name="email" type="email" placeholder="name@company.com" />
        </label>
        <label>
          Team size
          <select name="teamSize">
            <option value="">Choose</option>
            <option value="1-5">1-5</option>
            <option value="6-20">6-20</option>
            <option value="21-100">21-100</option>
          </select>
        </label>
        <label class="field-full">
          Password
          <input name="password" type="password" placeholder="Never captured raw by default" />
        </label>
        <label class="field-full">
          Notes
          <textarea name="notes" rows="4" placeholder="Write a short product note"></textarea>
        </label>
        <label>
          <input name="subscribe" type="checkbox" />
          Subscribe to updates
        </label>
      </div>
      <div class="toolbar">
        <button type="submit">Submit form</button>
        <button type="button" id="show-validation" class="secondary">Trigger validation state</button>
      </div>
      <div id="form-response"></div>
    </form>
  `;
}

function renderListRoute(): string {
  return `
    <span class="tag">Async list route</span>
    <h2>Virtualized-ish feed with scroll container context</h2>
    <p>The list below appends chunks after async work and uses a capped scroll container instead of the main window.</p>
    <div id="feed-container" class="feed" aria-label="Async content feed">
      ${state.feedItems
        .map(
          (item) => `
            <article class="feed-card" data-item-id="${item.id}">
              <h3>${item.title}</h3>
              <p>${item.body}</p>
              <button class="secondary" data-feed-action="${item.id}">Inspect card ${item.id}</button>
            </article>
          `,
        )
        .join('')}
    </div>
    <div class="toolbar">
      <button id="load-more-feed">Load more results</button>
    </div>
  `;
}

function bindHomeRoute(): void {
  document.querySelectorAll<HTMLElement>('[data-route-action]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.dataset.routeAction as RouteKey);
    });
  });

  document.getElementById('reveal-cta')?.addEventListener('click', async () => {
    await simulateFetch({ reveal: true }, 320);
    const slot = document.getElementById('delayed-cta-slot');
    if (slot) {
      slot.innerHTML = `
        <div class="feed-card">
          <h3>Freshly rendered call to action</h3>
          <p>This card appeared after a fetch-backed delay.</p>
          <button class="secondary">Acknowledge</button>
        </div>
      `;
    }
  });
}

function bindFormRoute(): void {
  const form = document.getElementById('signup-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = document.getElementById('form-response');
    if (response) {
      response.innerHTML = '<p>Submitting...</p>';
    }

    const formData = new FormData(form);
    await simulateFetch(
      {
        email: formData.get('email'),
        teamSize: formData.get('teamSize'),
        subscribe: formData.get('subscribe') === 'on'
      },
      380,
    );

    if (response) {
      response.innerHTML = `
        <article class="feed-card">
          <h3>Form submitted</h3>
          <p>Async validation finished and confirmation UI was rendered.</p>
        </article>
      `;
    }

    pushToast('Form flow recorded.');
  });

  document.getElementById('show-validation')?.addEventListener('click', () => {
    const response = document.getElementById('form-response');
    if (response) {
      response.innerHTML = `
        <article class="feed-card">
          <h3>Validation warning</h3>
          <p role="alert">Add a longer note before continuing.</p>
        </article>
      `;
    }
  });
}

function bindListRoute(): void {
  const feedContainer = document.getElementById('feed-container');
  feedContainer?.addEventListener('scroll', () => {
    if (!feedContainer) {
      return;
    }

    if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - 24) {
      void hydrateFeed();
    }
  });

  document.getElementById('load-more-feed')?.addEventListener('click', () => {
    void hydrateFeed();
  });

  document.querySelectorAll<HTMLElement>('[data-feed-action]').forEach((button) => {
    button.addEventListener('click', () => {
      pushToast(`Inspected card ${button.dataset.feedAction}.`);
    });
  });
}

function renderModal(): void {
  const layer = document.getElementById('modal-layer');
  if (!layer) {
    return;
  }

  layer.hidden = !state.modalOpen;
  if (!state.modalOpen) {
    layer.innerHTML = '';
    return;
  }

  layer.innerHTML = `
    <div class="modal-scrim"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Upgrade prompt">
      <h2>Upgrade prompt</h2>
      <p>This modal opens after a delayed mutation to exercise visible context and modal stack capture.</p>
      <div class="toolbar">
        <button id="confirm-modal">Confirm</button>
        <button id="dismiss-modal" class="secondary">Dismiss</button>
      </div>
    </div>
  `;

  document.getElementById('dismiss-modal')?.addEventListener('click', () => {
    state.modalOpen = false;
    renderModal();
  });
  document.getElementById('confirm-modal')?.addEventListener('click', () => {
    pushToast('Modal confirmed.');
    state.modalOpen = false;
    renderModal();
  });
}

function renderDrawer(): void {
  const layer = document.getElementById('drawer-layer');
  if (!layer) {
    return;
  }

  layer.hidden = !state.drawerOpen;
  if (!state.drawerOpen) {
    layer.innerHTML = '';
    return;
  }

  layer.innerHTML = `
    <div class="drawer-scrim"></div>
    <aside class="drawer-card" role="complementary" data-drawer="true" aria-label="Inspector drawer">
      <h2>Inspector drawer</h2>
      <p>The drawer appears after async work and contains interactive controls.</p>
      <label>
        Status
        <select>
          <option>Draft</option>
          <option>Review</option>
          <option>Approved</option>
        </select>
      </label>
      <div class="toolbar">
        <button id="close-drawer" class="secondary">Close drawer</button>
      </div>
    </aside>
  `;

  document.getElementById('close-drawer')?.addEventListener('click', () => {
    state.drawerOpen = false;
    renderDrawer();
  });
}

function pushToast(message: string): void {
  state.toasts.push(message);
  const toastStack = document.getElementById('toast-stack');
  if (!toastStack) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toastStack.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2400);
  renderLiveStatus();
}

async function hydrateFeed(): Promise<void> {
  if (state.loadingFeed) {
    return;
  }

  state.loadingFeed = true;
  renderLiveStatus();
  const nextPage = state.feedPage;
  const payload = await simulateFetch(
    Array.from({ length: 6 }, (_, index) => ({
      id: nextPage * 100 + index,
      title: `Async item ${nextPage * 100 + index}`,
      body: 'Loaded after fetch resolution and appended into the feed container.'
    })),
    300,
  );

  state.feedItems.push(...payload);
  state.feedPage += 1;
  state.loadingFeed = false;
  renderContent();
  renderLiveStatus();
}

async function simulateFetch<T>(data: T, delayMs: number): Promise<T> {
  const response = await fetch(`data:application/json,${encodeURIComponent(JSON.stringify(data))}`);
  const parsed = (await response.json()) as T;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return parsed;
}

function navigate(route: RouteKey): void {
  history.pushState({}, '', `/${route}`);
  state.route = route;
  renderContent();
  renderLiveStatus();
}

function renderLiveStatus(): void {
  const status = window.FlowRecorder.getStatus();
  const panel = document.getElementById('live-status');
  if (!panel) {
    return;
  }

  panel.innerHTML = `
    <p><strong>Recorder:</strong> ${status.started ? 'running' : 'idle'}</p>
    <p><strong>Events:</strong> ${status.eventCount}</p>
    <p><strong>Session:</strong> ${status.sessionId || '-'}</p>
    <p><strong>Route:</strong> ${state.route}</p>
    <p><strong>Feed loading:</strong> ${state.loadingFeed ? 'yes' : 'no'}</p>
  `;
}

function readRoute(): RouteKey {
  const route = window.location.pathname.replace(/^\//, '') || 'home';
  if (route === 'forms' || route === 'lists') {
    return route;
  }
  return 'home';
}
