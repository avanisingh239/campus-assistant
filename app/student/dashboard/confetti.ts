/**
 * Ported near-verbatim from dashboard.html's `confettiBurst()` — direct DOM
 * manipulation rather than React state, on purpose: it's a fire-and-forget
 * cosmetic effect (12 short-lived spans, self-removing after 800ms), and
 * modeling that as React state would add a render cycle and cleanup logic
 * for no benefit over what the prototype already does correctly.
 *
 * `prefers-reduced-motion` is handled by the CSS module's global
 * `@media (prefers-reduced-motion: reduce) { * { animation: none } }`
 * override (same as the prototype) — the spans still get created and
 * removed here, they just don't visibly animate under that preference.
 */
const CONFETTI_COLORS = ["#0C3B2E", "#6D9773", "#BB8A52", "#FFBA00"];

export function confettiBurst(originElement: HTMLElement) {
  const rect = originElement.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  for (let i = 0; i < 12; i++) {
    const span = document.createElement("span");
    span.textContent = "●";
    span.style.position = "fixed";
    span.style.pointerEvents = "none";
    span.style.fontSize = "16px";
    span.style.zIndex = "99";
    span.style.animation = "confettiFly 0.8s ease-out forwards";
    span.style.color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];

    const angle = (Math.PI * 2 * i) / 12;
    const distance = 32 + Math.random() * 22;
    span.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
    span.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
    span.style.left = `${originX}px`;
    span.style.top = `${originY}px`;

    document.body.appendChild(span);
    setTimeout(() => span.remove(), 800);
  }
}
