const $ = id => document.getElementById('dating-' + id);
const panelButtons = Array.from(document.querySelectorAll('[data-panel]'));
const intents = {
  'long-term': 'A relationship',
  'short-term': 'Casual dating',
  open: 'Open to seeing where it goes',
};
const apiRoot = new URL('/dating-api/', location.origin);
const time = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
let session = { member: null, profile: null };
let panel = 'profile';
let peer = null;
let reported = null;
let pendingMessage = null;
let busy = false;

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function notice(text = '') {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}

class DatingRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, method = 'GET', data) {
  const response = await fetch(new URL(path, apiRoot), {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new DatingRequestError(response.status, result.error || 'The dating server could not complete this request.');
  return result;
}

function resetConversation() {
  peer = null;
  pendingMessage = null;
  $('message').reset();
  $('messages').replaceChildren();
  $('conversation').hidden = true;
}

function showScreen(name) {
  for (const screen of ['auth', 'new-key', 'members', 'offline']) $(screen).hidden = screen !== name;
}

function clearMemberView() {
  session = { member: null, profile: null };
  $('profile').reset();
  $('discover-cards').replaceChildren();
  $('match-cards').replaceChildren();
  $('sign-in').reset();
  $('generated-key').value = '';
  resetConversation();
  showScreen('auth');
}

async function change(control, operation, errorBox) {
  if (busy) return;
  busy = true;
  control.disabled = true;
  if (errorBox) errorBox.hidden = true;
  notice();
  try {
    await operation();
  } catch (error) {
    const message = error instanceof DatingRequestError ? error.message : 'The dating server could not be reached. Try again.';
    if (error.status === 401 && session.member) {
      $('report').close();
      clearMemberView();
      notice('Your session expired. Sign in to continue.');
    } else if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    } else {
      notice(message);
    }
  } finally {
    control.disabled = false;
    busy = false;
  }
}

function button(text, operation, className = '') {
  const control = element('button', text, 'button ' + className);
  control.type = 'button';
  control.addEventListener('click', () => change(control, operation));
  return control;
}

function fillProfile() {
  $('profile').reset();
  if (!session.profile) return;
  for (const field of ['alias', 'age', 'region', 'intent', 'intro', 'icebreaker']) {
    $('profile').elements.namedItem(field).value = session.profile[field];
  }
  $('profile').elements.namedItem('listed').checked = Boolean(session.profile.listed);
}

async function showMember() {
  session = await request('session');
  if (!session.member) {
    clearMemberView();
    return;
  }
  fillProfile();
  showScreen('members');
  await showPanel(session.profile?.listed ? 'discover' : 'profile');
}

async function start() {
  notice('Connecting to dating…');
  try {
    const status = await request('status');
    if (status.service !== 'telephone-dating' || !status.ready) throw new Error('Dating server unavailable');
    $('register').hidden = !status.signups;
    $('signups-closed').hidden = status.signups;
    notice();
    await showMember();
  } catch {
    notice();
    showScreen('offline');
  }
}

async function showPanel(name) {
  panel = name;
  for (const control of panelButtons) {
    const selected = control.dataset.panel === name;
    control.setAttribute('aria-pressed', String(selected));
    $('panel-' + control.dataset.panel).hidden = !selected;
  }
  if (name === 'discover') await loadDiscovery();
  if (name === 'matches') await loadMatches();
}

function cardFor(profile, discovery) {
  const card = element('article', undefined, 'dating-card');
  card.append(element('h3', `${profile.alias}, ${profile.age}`));
  card.append(element('p', [profile.region, intents[profile.intent]].filter(Boolean).join(' · '), 'dating-muted'));
  if (profile.intro) card.append(element('p', profile.intro));
  const icebreaker = element('blockquote');
  icebreaker.append(element('p', 'Vending machine for feelings', 'dating-muted'), element('p', profile.icebreaker));
  card.append(icebreaker);
  const actions = element('div', undefined, 'dating-actions');
  if (discovery) {
    actions.append(button('Interested', () => choose(profile, 'interested'), 'dating-primary'),
      button('Pass', () => choose(profile, 'pass')));
  } else {
    actions.append(button('Open conversation', async () => {
      if (peer?.id !== profile.id) resetConversation();
      peer = profile;
      $('conversation').hidden = false;
      document.getElementById('thread-title').textContent = 'Conversation with ' + profile.alias;
      await loadConversation();
      $('message').elements.namedItem('message').focus();
    }, 'dating-primary'));
  }
  actions.append(button('Block', async () => {
    if (confirm('Block this member? They will disappear from discovery and matches, and your conversation will close.')) {
      await request('block', 'POST', { profileId: profile.id });
      if (peer?.id === profile.id) resetConversation();
      notice('Member blocked.');
      await showPanel(panel);
    }
  }), button('Report', () => {
    reported = profile;
    $('report-form').reset();
    $('report-error').hidden = true;
    $('report').showModal();
  }));
  card.append(actions);
  return card;
}

async function loadDiscovery() {
  $('discover-cards').replaceChildren();
  $('discover-empty').textContent = '';
  if (!session.profile?.listed) {
    $('discover-empty').textContent = 'Show your profile in My profile to discover other members.';
    return;
  }
  const intent = $('filter').value;
  const { profiles } = await request(intent ? 'discover?intent=' + encodeURIComponent(intent) : 'discover');
  $('discover-cards').replaceChildren(...profiles.map(profile => cardFor(profile, true)));
  $('discover-empty').textContent = profiles.length ? '' : 'No new profiles here yet. Try a different filter or check back later.';
}

async function choose(profile, choice) {
  const result = await request('choose', 'POST', { profileId: profile.id, choice });
  if (result.matched) {
    await showPanel('matches');
    notice(`You matched with ${profile.alias}. Open a conversation under Matches.`);
  } else {
    await loadDiscovery();
    notice(choice === 'interested' ? 'Interest saved. A match appears when they’re interested too.' : 'Profile passed.');
  }
}

async function loadMatches() {
  if (!session.profile) {
    $('matches-empty').textContent = 'Save your profile to start matching.';
    return;
  }
  const { profiles } = await request('matches');
  $('match-cards').replaceChildren(...profiles.map(profile => cardFor(profile, false)));
  $('matches-empty').textContent = profiles.length ? '' : 'When two people choose Interested, they’ll appear here.';
  if (peer && !profiles.some(profile => profile.id === peer.id)) resetConversation();
}

async function loadConversation() {
  if (!peer) return;
  try {
    const { messages } = await request('conversation/' + peer.id);
    const items = messages.map(message => {
      const item = element('li', undefined, message.mine ? 'mine' : '');
      item.append(element('span', (message.mine ? 'You' : peer.alias) + ' · ' + time.format(message.sentAt), 'dating-muted'),
        element('p', message.body));
      return item;
    });
    $('messages').replaceChildren(...(items.length ? items : [element('li', 'Start with your match’s icebreaker.')]));
  } catch (error) {
    if (error.status === 404) {
      resetConversation();
      await loadMatches();
    }
    throw error;
  }
}

function submit(id, operation, errorBox) {
  const form = $(id);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    void change(event.submitter || form.querySelector('[type="submit"]'), () => operation(values, form), errorBox);
  });
}

submit('register', async values => {
  const { signInKey } = await request('register', 'POST', { adult: values.has('adult') });
  $('generated-key').value = signInKey;
  showScreen('new-key');
  $('generated-key').focus();
});
submit('sign-in', async (values, form) => {
  await request('sign-in', 'POST', { key: values.get('key') });
  form.reset();
  await showMember();
});
submit('profile', async values => {
  const listed = values.has('listed');
  await request('profile', 'PUT', { alias: values.get('alias'), age: Number(values.get('age')),
    region: values.get('region'), intro: values.get('intro'), icebreaker: values.get('icebreaker'), intent: values.get('intent'), listed });
  await showMember();
  notice(listed ? 'Profile saved. Signed-in members can discover it.' : 'Profile saved with discovery paused.');
});
submit('message', async (values, form) => {
  if (!peer) return;
  const message = values.get('message').trim();
  if (!pendingMessage || pendingMessage.message !== message) pendingMessage = { message, clientId: crypto.randomUUID() };
  await request('conversation/' + peer.id, 'POST', pendingMessage);
  pendingMessage = null;
  if (form.elements.namedItem('message').value.trim() === message) form.reset();
  await loadConversation();
});
submit('report-form', async values => {
  if (!reported) return;
  await request('report', 'POST', { profileId: reported.id, reason: values.get('reason') });
  if (peer?.id === reported.id) resetConversation();
  $('report').close();
  reported = null;
  await showPanel(panel);
  notice('Report submitted and member blocked.');
}, $('report-error'));

function listen(id, operation) {
  const control = $(id);
  control.addEventListener('click', () => change(control, operation));
}

listen('retry', start);
listen('copy-key', async () => {
  try {
    await navigator.clipboard.writeText($('generated-key').value);
    notice('Sign-in key copied.');
  } catch {
    $('generated-key').select();
    notice('Copy the selected sign-in key.');
  }
});
listen('key-done', async () => {
  await showMember();
  $('generated-key').value = '';
});
listen('signout', async () => {
  await request('sign-out', 'POST');
  clearMemberView();
  notice('Signed out.');
});
listen('delete', async () => {
  if (!confirm('Permanently delete your dating account and conversations?')) return;
  await request('account', 'DELETE');
  clearMemberView();
  notice('Dating account deleted.');
});
listen('refresh-matches', loadMatches);
listen('refresh-thread', loadConversation);
$('report-cancel').addEventListener('click', () => $('report').close());
$('filter').addEventListener('change', () => change($('filter'), loadDiscovery));
for (const control of panelButtons) control.addEventListener('click', () => change(control, () => showPanel(control.dataset.panel)));
void start();
