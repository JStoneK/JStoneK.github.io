(() => {
  const endpoint = 'https://busuanzi.ibruce.info/busuanzi';
  const fields = ['site_uv', 'site_pv', 'page_pv'];
  let requestId = 0;
  let cancelPending;

  function loadVisitCounts() {
    cancelPending?.();
    const counters = fields.map(field => [field, document.getElementById(`busuanzi_value_${field}`)]);
    if (!counters.some(([, element]) => element)) return;

    const callback = `BusuanziCallback_${Date.now()}${++requestId}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(cleanup, 8000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callback];
      script.onerror = null;
      script.remove();
      if (cancelPending === cleanup) cancelPending = undefined;
    }

    window[callback] = data => {
      for (const [field, element] of counters) {
        const count = data?.[field];
        if (element?.isConnected && /^\d+$/.test(String(count))) {
          element.textContent = String(count);
        }
      }
      cleanup();
    };

    cancelPending = cleanup;
    script.onerror = cleanup;
    script.src = `${endpoint}?jsonpCallback=${callback}`;
    document.head.appendChild(script);
  }

  loadVisitCounts();
  document.addEventListener('pjax:complete', loadVisitCounts);
})();
