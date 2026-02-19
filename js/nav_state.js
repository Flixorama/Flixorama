// js/nav_state.js
const STACK_KEY = "return_to_stack_v1";

/**
 * Guarda el URL + scroll actual como "destino de regreso" (push).
 * Esto permite cadenas: series -> details -> episodes.
 */
export function setReturnToCurrentPage() {
  try {
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    stack.push({
      url: window.location.href,
      scrollY: Number(window.scrollY || 0) || 0
    });
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
  } catch {}
}

/**
 * Consume (pop) el último destino guardado.
 * Retorna {url, scrollY} o {url:"", scrollY:0}
 */
export function consumeReturnTo() {
  try {
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    const last = stack.pop();

    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));

    if (!last?.url) return { url: "", scrollY: 0 };
    return { url: last.url, scrollY: Number(last.scrollY || 0) || 0 };
  } catch {
    return { url: "", scrollY: 0 };
  }
}

/**
 * Restaura scroll desde el último destino guardado SIN consumirlo.
 * Útil si quieres volver y mantener el scroll.
 */
export function restoreScrollFromSession() {
  try {
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    const last = stack[stack.length - 1];
    const y = Number(last?.scrollY || 0) || 0;
    if (y > 0) window.scrollTo({ top: y, behavior: "auto" });
  } catch {}
}
