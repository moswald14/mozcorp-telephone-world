export const icebreakers = Object.freeze([
  'What would you put in a vending machine for feelings?',
  'What song would you put on a mixtape for someone you just met?',
  'If our first date came with a side quest, what would it be?',
  'Which ordinary thing do you think is secretly romantic?',
  'What would you name a tiny radio station that only plays after midnight?',
  'What is the smallest thing that can make a bad day turn around?',
]);

const starters = Object.freeze([
  Object.freeze({ id: 'lost-and-found', title: 'Lost and Found Feelings',
    seed: 'At midnight, a vending machine in Mozville starts dispensing feelings people left behind. Its night attendant has until sunrise to find the owner of a feeling with no label.' }),
  Object.freeze({ id: 'collect-from-the-moon', title: 'Collect Call from the Moon',
    seed: 'A pay phone rings in an empty laundromat. The moon is calling collect. It forgot the end of its own bedtime story, and asks the night clerk to invent one.' }),
  Object.freeze({ id: 'last-bus', title: 'Last Bus to Mozville',
    seed: 'The last bus to Mozville keeps dropping passengers off at a place they dreamed about as kids. Two strangers have to agree where it should go next.' }),
]);

export function transmissionStarter(id) {
  return starters.find(starter => starter.id === id) ?? null;
}

export function mountSwitchboard(root = document) {
  const list = root.getElementById('transmission-starters');
  if (!list) return;
  for (const starter of starters) {
    const li = root.createElement('li');
    const link = root.createElement('a');
    const title = root.createElement('strong');
    const premise = root.createElement('span');
    link.className = 'transmission-starter';
    link.href = '?transmission=' + encodeURIComponent(starter.id) + '#mozcorp';
    link.target = '_blank';
    link.rel = 'noopener';
    title.textContent = starter.title;
    premise.textContent = starter.seed;
    link.append(title, premise);
    li.append(link);
    list.append(li);
  }

  const question = root.getElementById('hero-icebreaker');
  const next = root.getElementById('next-icebreaker');
  const copy = root.getElementById('copy-icebreaker');
  const status = root.getElementById('icebreaker-status');
  const field = root.getElementById('icebreaker-copy-field');
  let selected = 0;
  root.getElementById('switchboard-actions').hidden = false;
  next.addEventListener('click', () => {
    selected = (selected + 1) % icebreakers.length;
    question.textContent = icebreakers[selected];
    field.hidden = true;
    status.hidden = true;
  });
  copy.addEventListener('click', async () => {
    const current = selected;
    const text = icebreakers[current];
    copy.disabled = true;
    try {
      await navigator.clipboard.writeText(text);
      if (current !== selected) return;
      field.hidden = true;
      status.textContent = 'Question copied.';
    } catch {
      if (current !== selected) return;
      field.value = text;
      field.hidden = false;
      field.select();
      status.textContent = 'Copy the selected question.';
    } finally {
      copy.disabled = false;
    }
    status.hidden = false;
  });
}
