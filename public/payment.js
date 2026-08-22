// Polls /api/invoices/:id until the invoice reaches a terminal state.
// The invoice id and unit are injected by the server as data attributes.
(function () {
  const statusEl = document.getElementById("status");
  const invoiceId = statusEl?.dataset.invoiceId;
  if (!invoiceId) return;

  const unit = statusEl.dataset.unit || "";
  const receivedEl = document.getElementById("received");
  const resultEl = document.getElementById("result");
  const successEl = document.getElementById("success-message");

  const messages = {
    pending: "Waiting for payment.",
    paid: "Payment received.",
    underpaid: "Payment is less than the stated amount.",
    expired: "Invoice expired before a matching payment was found.",
  };
  const terminal = new Set(["paid", "underpaid", "expired"]);
  let timer = null;
  let failures = 0;

  function render(result) {
    statusEl.textContent = result.status;
    statusEl.dataset.status = result.status;
    receivedEl.textContent = `${result.receivedAmount ?? "—"} ${unit}`;

    resultEl.textContent =
      result.status === "paid" || result.status === "pending"
        ? ""
        : result.message || messages[result.status] || "";
    successEl.textContent = result.status === "paid" ? result.message : "";
  }

  async function tick() {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`);
      if (!response.ok) {
        throw new Error(`status request failed: ${response.status}`);
      }
      failures = 0;
      const result = await response.json();
      render(result);
      if (terminal.has(result.status)) {
        stop();
      }
    } catch (error) {
      failures += 1;
      console.error(error);
      if (failures >= 3 && !terminal.has(statusEl.dataset.status)) {
        resultEl.textContent =
          "An error occurred while checking the transaction.";
      }
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else if (!timer && !terminal.has(statusEl.dataset.status)) {
      timer = setInterval(tick, 5000);
      tick();
    }
  });

  timer = setInterval(tick, 5000);
  tick();
})();
