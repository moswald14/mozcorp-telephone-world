import { createMozCorpUI } from './mozcorp-ui.mjs';
import { mountSwitchboard, transmissionStarter } from './switchboard.mjs';
import { mountStudioPanel } from './studio-panel.mjs';

const workspace = document.querySelector('#workspace');
const studio = mountStudioPanel(document.querySelector('#dot-studio'));
mountSwitchboard();
const starter = transmissionStarter(new URLSearchParams(location.search).get('transmission'));
try {
  createMozCorpUI(workspace, { starter, openStudio: studio.openForWorld, stopStudio: studio.stop }).setVisible(true);
} catch {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'The workspace could not start. Reload this page in a browser that supports local project storage.';
  workspace.replaceChildren(message);
}
