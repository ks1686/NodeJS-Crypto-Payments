// Live reachability indicator for the two chain explorers, shown on the home
// page. Pure diagnostics — the server never depends on this.
(function () {
  const el = document.getElementById("api-indicator");
  if (!el) return;

  async function check(path, label) {
    try {
      const response = await fetch(`/api/chain-status/${path}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      return { label, ok: Boolean(body.ok) };
    } catch {
      return { label, ok: false };
    }
  }

  Promise.all([check("eth", "ETH"), check("xlm", "XLM")]).then((results) => {
    const text = results
      .map((r) => `${r.label}: ${r.ok ? "✓ reachable" : "✗ unreachable"}`)
      .join("  ·  ");
    el.textContent = text;
    el.classList.add(results.every((r) => r.ok) ? "ok" : "degraded");
  });
})();
