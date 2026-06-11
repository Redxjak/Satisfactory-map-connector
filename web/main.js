import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TOKEN_KEY = 'satisfactory-map-connector-token';

const app = document.querySelector('#app');

if (!API_BASE_URL) {
  app.innerHTML = `
    <main class="center">
      <section class="panel compact">
        <h1>Configuration Missing</h1>
        <p>Set VITE_API_BASE_URL.</p>
      </section>
    </main>
  `;
  throw new Error('Missing frontend configuration');
}

let authToken = window.localStorage.getItem(TOKEN_KEY);
let user = null;
let connections = [];
let selectedId = null;
let busy = false;
let notice = '';

async function api(path, options = {}) {
  if (!authToken) throw new Error('You are not signed in');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'Unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function currentConnection() {
  return connections.find((connection) => connection.id === selectedId) || connections[0] || null;
}

function setNotice(message) {
  notice = message;
  render();
}

async function withBusy(action, successMessage) {
  busy = true;
  notice = '';
  render();
  try {
    const result = await action();
    if (successMessage) notice = successMessage;
    return result;
  } catch (error) {
    notice = error.message;
  } finally {
    busy = false;
    render();
  }
}

async function loadState() {
  await withBusy(async () => {
    const me = await api('/me');
    user = me.user;
    const response = await api('/connections');
    connections = response.connections;
    if (!selectedId && connections.length) selectedId = connections[0].id;
  });
}

async function login(event) {
  event.preventDefault();
  const code = new FormData(event.currentTarget).get('code').trim();
  busy = true;
  render();
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Access code was not accepted');
    authToken = body.token;
    user = body.user;
    window.localStorage.setItem(TOKEN_KEY, authToken);
    notice = '';
    await loadState();
  } catch (error) {
    notice = error.message;
  } finally {
    busy = false;
    render();
  }
}

async function signOut() {
  if (authToken) {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
  }
  authToken = null;
  user = null;
  connections = [];
  selectedId = null;
  window.localStorage.removeItem(TOKEN_KEY);
  render();
}

async function saveConnection(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get('id');
  const payload = {
    name: formData.get('name').trim(),
    host: formData.get('host').trim(),
    port: Number(formData.get('port')),
    username: formData.get('username').trim(),
    remoteDir: formData.get('remoteDir').trim(),
    active: formData.get('active') === 'on',
  };
  const password = formData.get('password');
  if (password) payload.password = password;

  await withBusy(async () => {
    if (id) {
      await api(`/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      if (!password) throw new Error('Password is required for a new connection');
      const response = await api('/connections', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      selectedId = response.connection.id;
    }
    await loadState();
  }, 'Connection saved.');
}

async function deleteSelected() {
  const connection = currentConnection();
  if (!connection) return;
  if (!window.confirm(`Delete ${connection.name}?`)) return;

  await withBusy(async () => {
    await api(`/connections/${connection.id}`, { method: 'DELETE' });
    selectedId = null;
    await loadState();
  }, 'Connection deleted.');
}

async function pullSelected() {
  const connection = currentConnection();
  if (!connection) return;

  await withBusy(async () => {
    await api(`/connections/${connection.id}/pull`, { method: 'POST' });
    await loadState();
  }, 'Latest save pulled.');
}

async function makeScimLink(openImmediately = false) {
  const connection = currentConnection();
  if (!connection) return;

  await withBusy(async () => {
    const response = await api(`/connections/${connection.id}/scim-link`, { method: 'POST' });
    await navigator.clipboard.writeText(response.link.scimUrl);
    if (openImmediately) window.open(response.link.scimUrl, '_blank', 'noopener,noreferrer');
    setNotice(`SCIM link copied. It expires in ${Math.round(response.link.expiresInSeconds / 60)} minutes.`);
  });
}

function loginView() {
  return `
    <main class="center hero">
      <section class="panel compact">
        <div class="eyebrow">Satisfactory Map Connector</div>
        <h1>Open the latest server save in SCIM.</h1>
        <p>Enter an approved access code to manage SFTP save sources and generate temporary calculator links.</p>
        <form id="login-form" class="stack">
          <label>
            Access Code
            <input name="code" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit" ${busy ? 'disabled' : ''}>Sign In</button>
        </form>
        ${notice ? `<p class="notice">${notice}</p>` : ''}
      </section>
    </main>
  `;
}

function connectionList() {
  if (!connections.length) return '<p class="empty">No server connections yet.</p>';
  return connections
    .map(
      (connection) => `
        <button class="connection ${connection.id === selectedId ? 'selected' : ''}" data-id="${connection.id}">
          <span>${connection.name}</span>
          <small>${connection.latestSaveName || 'No save pulled yet'}</small>
        </button>
      `,
    )
    .join('');
}

function connectionForm(connection) {
  return `
    <form id="connection-form" class="form-grid">
      <input type="hidden" name="id" value="${connection?.id || ''}" />
      <label>
        Name
        <input name="name" required value="${connection?.name || ''}" placeholder="The Otter Box" />
      </label>
      <label>
        Host
        <input name="host" required value="${connection?.host || ''}" placeholder="jp-tyo-02-002.myserverfiles.com" />
      </label>
      <label>
        Port
        <input name="port" type="number" min="1" max="65535" required value="${connection?.port || 22}" />
      </label>
      <label>
        Username
        <input name="username" required value="${connection?.username || ''}" autocomplete="username" />
      </label>
      <label class="wide">
        Save Folder
        <input name="remoteDir" required value="${connection?.remoteDir || '/.config/Epic/FactoryGame/Saved/SaveGames/server'}" />
      </label>
      <label class="wide">
        ${connection ? 'New Password (leave blank to keep current)' : 'Password'}
        <input name="password" type="password" autocomplete="current-password" ${connection ? '' : 'required'} />
      </label>
      <label class="check">
        <input name="active" type="checkbox" ${connection?.active !== false ? 'checked' : ''} />
        Refresh every 30 minutes
      </label>
      <div class="actions wide">
        <button type="submit" ${busy ? 'disabled' : ''}>Save Connection</button>
        ${connection ? `<button type="button" id="delete-button" class="danger" ${busy ? 'disabled' : ''}>Delete</button>` : ''}
      </div>
    </form>
  `;
}

function dashboardView() {
  const connection = currentConnection();
  return `
    <main class="app-shell">
      <aside class="sidebar">
        <div>
          <div class="eyebrow">Satisfactory</div>
          <h1>Map Connector</h1>
        </div>
        <div class="user">
          <span>${user?.label || 'Approved user'}</span>
          <button id="signout-button" class="ghost">Sign Out</button>
        </div>
        <div class="connections">
          ${connectionList()}
        </div>
        <button id="new-button" class="secondary">New Connection</button>
      </aside>

      <section class="workspace">
        <div class="topline">
          <div>
            <h2>${connection ? connection.name : 'New Connection'}</h2>
            <p>${connection ? `${connection.host}:${connection.port}` : 'Add a SFTP save source.'}</p>
          </div>
          ${
            connection
              ? `<div class="actions">
                  <button id="pull-button" ${busy ? 'disabled' : ''}>Pull Latest Save</button>
                  <button id="copy-link-button" class="secondary" ${busy ? 'disabled' : ''}>Copy SCIM Link</button>
                  <button id="open-link-button" class="secondary" ${busy ? 'disabled' : ''}>Open in SCIM</button>
                </div>`
              : ''
          }
        </div>

        ${notice ? `<p class="notice">${notice}</p>` : ''}

        ${
          connection
            ? `<section class="stats">
                <div><span>Latest save</span><strong>${connection.latestSaveName || 'None yet'}</strong></div>
                <div><span>Size</span><strong>${formatBytes(connection.latestSaveBytes)}</strong></div>
                <div><span>Server modified</span><strong>${formatDate(connection.latestSaveModifiedAt)}</strong></div>
                <div><span>Last pulled</span><strong>${formatDate(connection.lastPulledAt)}</strong></div>
              </section>
              ${connection.lastError ? `<p class="error">Last error: ${connection.lastError}</p>` : ''}`
            : ''
        }

        <section class="panel">
          <h3>${connection ? 'Connection Settings' : 'Create Connection'}</h3>
          ${connectionForm(connection)}
        </section>
      </section>
    </main>
  `;
}

function render() {
  app.innerHTML = authToken ? dashboardView() : loginView();

  document.querySelector('#login-form')?.addEventListener('submit', login);
  document.querySelector('#signout-button')?.addEventListener('click', signOut);
  document.querySelector('#connection-form')?.addEventListener('submit', saveConnection);
  document.querySelector('#delete-button')?.addEventListener('click', deleteSelected);
  document.querySelector('#pull-button')?.addEventListener('click', pullSelected);
  document.querySelector('#copy-link-button')?.addEventListener('click', () => makeScimLink(false));
  document.querySelector('#open-link-button')?.addEventListener('click', () => makeScimLink(true));
  document.querySelector('#new-button')?.addEventListener('click', () => {
    selectedId = null;
    render();
  });
  document.querySelectorAll('.connection').forEach((button) => {
    button.addEventListener('click', () => {
      selectedId = button.dataset.id;
      render();
    });
  });
}

async function boot() {
  render();
  if (authToken) {
    await loadState();
    if (!user) {
      authToken = null;
      window.localStorage.removeItem(TOKEN_KEY);
      render();
    }
  }
}

boot();
