import { createMozCorpUI } from './mozcorp-ui.mjs';
import { mountSwitchboard, transmissionStarter } from './switchboard.mjs';

const workspace = document.querySelector('#workspace');
mountSwitchboard();
const starter = transmissionStarter(new URLSearchParams(location.search).get('transmission'));
try {
  createMozCorpUI(workspace, { starter }).setVisible(true);
} catch {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'The workspace could not start. Reload this page in a browser that supports local project storage.';
  workspace.replaceChildren(message);
}
