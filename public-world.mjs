import { createMozCorpUI } from './mozcorp-ui.mjs';

const workspace = document.querySelector('#workspace');
try {
  createMozCorpUI(workspace).setVisible(true);
} catch {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'The workspace could not start. Reload this page in a browser that supports local project storage.';
  workspace.replaceChildren(message);
}
