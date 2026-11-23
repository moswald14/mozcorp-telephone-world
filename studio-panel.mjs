export function mountStudioPanel(panel) {
  const heading = panel.querySelector('h2');
  const launch = panel.querySelector('#dot-studio-open');
  const separate = panel.querySelector('#dot-studio-separate');
  const status = panel.querySelector('#dot-studio-status');
  const host = panel.querySelector('#dot-studio-editor');
  const fragment = '#' + panel.id;
  let loading, editor, projectId;

  function loadEditor() {
    if (loading) return loading;
    const frame = document.createElement('iframe');
    frame.title = 'Dot Wave Studio music editor';
    frame.referrerPolicy = 'no-referrer';
    frame.src = new URL('./studio.html?embed=telephone#sound', import.meta.url);
    // Studio is our own editor on this origin, so it can open the same local project shelf.
    loading = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Studio took too long to load.')), 20000);
      frame.addEventListener('load', () => {
        clearTimeout(timer);
        const studio = frame.contentWindow.DotWaveStudio;
        if (typeof studio?.openTelephone === 'function') resolve(studio);
        else reject(new Error('Studio could not start.'));
      }, { once: true });
    }).then(studio => { editor = studio; return studio; }, error => {
      frame.remove();
      loading = null;
      throw error;
    });
    host.append(frame);
    return loading;
  }

  async function open() {
    launch.disabled = true;
    status.textContent = editor ? '' : 'Opening Dot Wave Studio…';
    try {
      const studio = await loadEditor();
      if (projectId) await studio.openTelephone(projectId);
      launch.hidden = true;
      status.textContent = '';
    } catch (error) {
      launch.textContent = 'Try Studio again';
      launch.hidden = false;
      status.textContent = error.message + ' Try again or open it in a separate tab.';
    } finally {
      launch.disabled = false;
    }
  }

  function stop() { editor?.stop(); }

  launch.hidden = false;
  launch.addEventListener('click', () => { void open(); });
  window.addEventListener('hashchange', () => {
    if (location.hash === fragment) {
      if (!loading) void open();
    } else {
      stop();
    }
  });
  if (location.hash === fragment) void open();

  return {
    stop,
    openForWorld(record) {
      projectId = record.id;
      const url = new URL('./studio.html', import.meta.url);
      url.searchParams.set('project', projectId);
      url.hash = 'telephone';
      separate.href = url.href;
      if (location.hash !== fragment) history.pushState(history.state, '', fragment);
      panel.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
      return open();
    },
  };
}
