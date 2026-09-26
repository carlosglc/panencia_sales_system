(() => {
  "use strict";

  // ================= utilidades =================
  const $ = (s, el = document) => el.querySelector(s);
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const CATS = [["pan", "Pan"], ["postres", "Postres y galletas"], ["laminados", "Laminados"], ["temporada", "Temporada"]];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function money(c, { decimals } = {}) {
    const v = (Number(c) || 0) / 100;
    const d = decimals ?? (Number.isInteger(v) ? 0 : 2);
    return "$" + v.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const toCents = v => (v === "" || v == null ? null : Math.round(Number(String(v).replace(/[$,\s]/g, "")) * 100));

  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseYmd = s => { const [y, m, d] = String(s || "").split("-").map(Number); return y ? new Date(y, m - 1, d) : null; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)); };
  const dayShort = s => { const d = parseYmd(s); return d ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : "—"; };
  const dayLong = s => { const d = parseYmd(s); return d ? `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}` : ""; };
  const dm = s => { const d = parseYmd(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : ""; };
  const weekLabel = (s, e) => { const a = parseYmd(s), b = parseYmd(e); return a.getMonth() === b.getMonth() ? `${a.getDate()} al ${b.getDate()} ${MONTHS[b.getMonth()]}` : `${dm(s)} al ${dm(e)}`; };
  const when = ms => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  const svg = (tag, attrs = {}) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

  const ICONS = {
    resumen: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pedidos: '<path d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20z"/><path d="M9.5 9h5M9.5 12.5h5"/>',
    nuevo: '<path d="M12 5v14M5 12h14"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
    menu: '<path d="M5 16c0-5 3-9 7-9s7 4 7 9z"/><path d="M4 16h16v3H4z"/><path d="M9 10.5l1 2M13 10l1 2"/>',
    usuarios: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    actividad: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    cuenta: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    whatsapp: '<path d="M4 20l1.4-4.1A8 8 0 1 1 8.3 19z"/><path d="M9 10.5h6M9 13.5h4"/>',
    mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  };
  const icon = name => { const s = el("span", { class: "ic", "aria-hidden": "true" }); s.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`; return s; };
  const STAR_PATH = "M12 0l1.6 7.1 5.3-5-3.5 6.4 7.1-.5-6.6 2.8 6.6 2.8-7.1-.5 3.5 6.4-5.3-5L12 24l-1.6-7.1-5.3 5 3.5-6.4-7.1.5 6.6-2.8L1.5 10.4l7.1.5-3.5-6.4 5.3 5z";
  const star = () => { const s = el("span", { class: "star", "aria-hidden": "true" }); s.innerHTML = `<svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg>`; return s; };
  const brand = () => el("div", { class: "brand" }, el("b", { text: "Panencia" }), star(), el("span", { class: "tag" }, "con masa madre · ", el("i", { text: "panel" })));

  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2800); }

  async function copyText(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); toast("Copiado"); }
    catch {
      if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast("Selecciona el texto y cópialo");
    }
  }
  const waPhone = p => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "52" + d; return d; };
  const waUrl = (phone, text) => "https://wa.me/" + waPhone(phone) + "?text=" + encodeURIComponent(text);

  // ================= API =================
  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/api/login") { const wasIn = !!S.me; S.me = null; renderLogin(wasIn ? "Tu sesión terminó. Vuelve a entrar." : ""); throw new ApiError(401, data.error || "Inicia sesión"); }
    if (!res.ok) throw new ApiError(res.status, data.error || "Algo falló. Inténtalo de nuevo.");
    return data;
  }
  // Ejecuta una escritura y avisa del resultado.
  async function act(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r || true; }
    catch (e) { if (e.status !== 401) toast(e.message); return false; }
  }

  // ================= estado =================
  const S = {
    me: null, products: [], settings: {}, weekOffset: 0, orderFilter: "all", search: "",
    form: null, // pedido en captura
  };
  const isAdmin = () => S.me && S.me.role === "admin";
  const currentWeek = () => addDays(weekStart(today()), S.weekOffset * 7);

  async function loadProducts() { S.products = (await api("GET", "/api/products")).products; }
  async function loadSettings() { S.settings = (await api("GET", "/api/settings")).settings; }

  // ================= login =================
  function renderLogin(message) {
    const err = el("p", { class: "err", role: "alert", hidden: !message, text: message || "" });
    const email = el("input", { type: "email", id: "login-email", autocomplete: "username", required: true });
    const pass = el("input", { type: "password", id: "login-pass", autocomplete: "current-password", required: true });
    const btn = el("button", { class: "btn primary", type: "submit", text: "Entrar" });
    const form = el("form", {
      onsubmit: async ev => {
        ev.preventDefault(); btn.disabled = true; err.hidden = true;
        try {
          const r = await api("POST", "/api/login", { email: email.value.trim(), password: pass.value });
          S.me = r.user; await boot();
        } catch (e) { err.textContent = e.message; err.hidden = false; pass.value = ""; pass.focus(); }
        finally { btn.disabled = false; }
      },
    },
      brand(),
      el("h1", { text: "Entrar al panel" }),
      el("p", { class: "muted small", text: "Pedidos, cobros y ventas de Panencia." }),
      err,
      el("div", { class: "field" }, el("label", { for: "login-email", text: "Correo" }), email),
      el("div", { class: "field" }, el("label", { for: "login-pass", text: "Contraseña" }), pass),
      btn);
    const root = $("#root"); root.textContent = "";
    root.append(el("main", { class: "login" }, form));
    email.focus();
  }

  // ================= estructura =================
  const NAV = [
    ["nuevo", "Nuevo pedido"], ["resumen", "Resumen"], ["pedidos", "Pedidos"], ["whatsapp", "Bandeja"], ["clientes", "Clientes"],
    ["menu", "Menú y costos"], ["usuarios", "Usuarios", true], ["actividad", "Actividad", true], ["cuenta", "Mi cuenta"],
  ];
  function renderShell() {
    const root = $("#root"); root.textContent = "";
    const side = el("aside", { class: "side" },
      brand(),
      el("nav", { "aria-label": "Secciones" }, NAV.filter(n => !n[2] || isAdmin()).map(([id, label]) =>
        el("a", { class: "navlink" + (id === "nuevo" ? " new" : ""), href: "#/" + id, "data-nav": id }, icon(id), label,
          id === "whatsapp" ? el("span", { class: "badge", "data-badge": "wa", hidden: true }) : null))),
      el("div", { class: "who" }, el("b", { text: S.me.name }), el("span", { class: "muted small", text: S.me.role === "admin" ? "Administración" : "Pedidos" }),
        el("button", { class: "btn sm ghost", type: "button", text: "Cerrar sesión", onclick: logout })));
    const top = el("header", { class: "topbar" }, brand());
    const main = el("main", { class: "main", id: "main" });
    const bottom = el("nav", { class: "bottomnav", "aria-label": "Secciones" },
      [["resumen", "Resumen"], ["pedidos", "Pedidos"], ["nuevo", "Nuevo"], ["whatsapp", "Bandeja"], ["mas", "Más"]].map(([id, label]) =>
        el("a", { href: "#/" + id, "data-nav": id, class: id === "nuevo" ? "plus" : null }, icon(id), label,
          id === "whatsapp" ? el("span", { class: "badge", "data-badge": "wa", hidden: true }) : null)));
    root.append(el("div", { class: "shell" }, side, el("div", {}, top, main)), bottom);
  }
  async function logout() {
    await api("POST", "/api/logout", {}).catch(() => {});
    S.me = null; location.hash = ""; renderLogin();
  }

  // ================= router =================
  let renderSeq = 0;
  const ROUTES = {
    resumen: viewResumen, pedidos: viewPedidos, nuevo: viewNuevo, pedido: viewNuevo, clientes: viewClientes, cliente: viewCliente,
    menu: viewMenu, usuarios: viewUsuarios, actividad: viewActividad, cuenta: viewCuenta, mas: viewMas, whatsapp: viewBandeja,
  };
  async function route() {
    if (!S.me) return;
    const [name, arg] = (location.hash.replace(/^#\/?/, "") || "resumen").split("/");
    const fn = ROUTES[name] || viewResumen;
    const nav = { pedido: "pedidos", cliente: "mas", clientes: "mas", menu: "mas", usuarios: "mas", actividad: "mas", cuenta: "mas" };
    document.querySelectorAll("[data-nav]").forEach(a => {
      const on = a.dataset.nav === name || (a.closest(".bottomnav") && a.dataset.nav === nav[name]) || (a.closest(".side") && name === "pedido" && a.dataset.nav === "pedidos") || (a.closest(".side") && name === "cliente" && a.dataset.nav === "clientes");
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const seq = ++renderSeq;
    const main = $("#main");
    const orderbar = document.querySelector(".orderbar"); if (orderbar) orderbar.remove();
    main.textContent = ""; main.append(el("div", { class: "loading", text: "Cargando…" }));
    try {
      const nodes = await fn(arg);
      if (seq !== renderSeq) return;
      main.textContent = ""; main.append(...[nodes].flat());
      window.scrollTo(0, 0);
    } catch (e) {
      if (seq !== renderSeq || e.status === 401) return;
      main.textContent = "";
      main.append(el("div", { class: "card" }, el("h2", { text: "No se pudo cargar" }), el("p", { class: "muted", text: e.message }),
        el("div", {}, el("button", { class: "btn", type: "button", text: "Reintentar", onclick: route }))));
    }
  }
  window.addEventListener("hashchange", route);
  const rerender = () => route();

  function pageHead(title, ...right) { return el("div", { class: "pagehead" }, el("h1", { text: title }), right.length ? el("div", { class: "row" }, ...right) : null); }
  function weekNav(ws, onChange) {
    const we = addDays(ws, 6);
    const label = S.weekOffset === 0 ? "Esta semana" : S.weekOffset === -1 ? "Semana pasada" : S.weekOffset === 1 ? "Próxima semana" : "Semana";
    return el("div", { class: "weeknav" },
      el("button", { class: "icon-btn", type: "button", "aria-label": "Semana anterior", text: "‹", onclick: () => { S.weekOffset--; onChange(); } }),
      el("div", { class: "t" }, el("b", { text: label }), el("span", { text: weekLabel(ymd(ws), ymd(we)) })),
      el("button", { class: "icon-btn", type: "button", "aria-label": "Semana siguiente", text: "›", onclick: () => { S.weekOffset++; onChange(); } }),
      S.weekOffset !== 0 ? el("button", { class: "btn sm ghost", type: "button", text: "Hoy", onclick: () => { S.weekOffset = 0; onChange(); } }) : null);
  }

  // ================= mensaje al cliente =================
  function buildMessage(o) {
    const L = [`Hola ${o.customer.name}! Este es tu pedido de Panencia:`, ""];
    for (const i of o.items) L.push(`• ${i.qty} × ${i.name} — ${money(i.qty * i.price_cents)}`);
    if (o.shipping_cents) L.push(`• Envío — ${money(o.shipping_cents)}`);
    if (o.discount_cents) L.push(`• Descuento — −${money(o.discount_cents)}`);
    L.push("", `Total: ${money(o.total_cents)}`, `Entrega: ${dayLong(o.delivery_date)}`);
    if (o.notes) L.push(`Notas: ${o.notes}`);
    L.push(`Pedido ${o.code}`, "");
    if (o.paid) L.push(`Pago recibido (${o.payment_method}). ¡Gracias!`);
    else L.push((S.settings.payment_note || "").trim() || "Te confirmo en cuanto reciba tu pago. ¡Gracias!");
    return L.join("\n");
  }

  // ================= RESUMEN =================
  async function viewResumen() {
    const ws = currentWeek();
    const from12 = ymd(addDays(weekStart(today()), -7 * 11));
    const [week, weeks, prods] = await Promise.all([
      api("GET", "/api/reports/week?start=" + ymd(ws)),
      api("GET", "/api/reports/weeks?n=12"),
      isAdmin() ? api("GET", "/api/reports/products?from=" + from12) : null,
    ]);
    const t = week.totals;
    const kpi = (label, v, sub, hl) => el("div", { class: "kpi" + (hl ? " hl" : "") }, el("span", { class: "label", text: label }), el("span", { class: "v", text: v }), sub ? el("span", { class: "small muted", text: sub }) : null);
    const kpis = el("div", { class: "kpis" },
      kpi("Vendido", money(t.sold_cents, { decimals: 0 }), `${t.orders} pedidos · ${t.pieces} panencios`, true),
      kpi("Cobrado", money(t.collected_cents, { decimals: 0 }), null),
      kpi("Por cobrar", money(t.owed_cents, { decimals: 0 }), week.owed.length ? `${week.owed.length} pendientes` : "nada pendiente"),
      isAdmin() ? kpi("Ganancia est.", money(t.profit_cents, { decimals: 0 }), t.missing_cost ? "hay productos sin costo" : "venta − costo") : kpi("Pedidos", String(t.orders), null));

    // lista de horneado
    const bake = el("div", { class: "card" }, el("div", { class: "row between" }, el("h2", { text: "Lista de horneado" }), el("span", { class: "small muted mono", text: "piezas por día de entrega" })));
    if (!week.bake.length) bake.append(el("div", { class: "empty", text: "Sin pedidos esta semana." }));
    else {
      const sh = s => { const d = parseYmd(s); return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()}`; };
      bake.append(el("div", { class: "tablewrap" }, el("table", {},
        el("thead", {}, el("tr", {}, el("th", { text: "Panencio" }), week.days.map(d => el("th", { class: "r", text: sh(d) })), el("th", { class: "r", text: "Total" }))),
        el("tbody", {}, week.bake.map(b => el("tr", {}, el("td", { text: b.name }), week.days.map(d => el("td", { class: "r m", text: b.by_day[d] || "·" })), el("td", { class: "r m", text: b.total })))),
        el("tfoot", {}, el("tr", {}, el("td", { text: "Piezas" }), week.days.map(d => el("td", { class: "r m", text: week.bake.reduce((a, b) => a + (b.by_day[d] || 0), 0) })), el("td", { class: "r m", text: t.pieces }))))));
    }
    const owed = el("div", { class: "card" }, el("h2", { text: "Por cobrar" }));
    if (!week.owed.length) owed.append(el("div", { class: "empty", text: t.orders ? "Todo cobrado." : "Sin pedidos." }));
    else owed.append(el("div", { class: "tablewrap" }, el("table", {}, el("tbody", {}, week.owed.map(o =>
      el("tr", { class: "link", onclick: () => (location.hash = "#/pedido/" + o.id) }, el("td", {}, el("b", { text: o.customer })), el("td", { class: "muted small", text: dayShort(o.delivery_date) }), el("td", { class: "r m", text: money(o.total_cents) })))))));

    const chartCard = el("div", { class: "card" });
    renderWeeksChart(chartCard, weeks.weeks);

    const out = [pageHead("Resumen", weekNav(ws, rerender)), kpis, chartCard, el("div", { class: "grid2" }, bake, owed)];
    if (prods) {
      const rows = prods.products;
      const card = el("div", { class: "card" }, el("div", { class: "row between" }, el("h2", { text: "Qué deja cada panencio" }), el("span", { class: "small muted mono", text: "últimas 12 semanas" })));
      if (!rows.length) card.append(el("div", { class: "empty", text: "Sin ventas en este periodo." }));
      else card.append(el("div", { class: "tablewrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ["Panencio", "Piezas", "Venta", "Costo", "Ganancia", "Margen"].map((h, i) => el("th", { class: i ? "r" : null, text: h })))),
        el("tbody", {}, rows.map(r => {
          const m = r.revenue_cents && !r.qty_without_cost ? r.profit_cents / r.revenue_cents : null;
          return el("tr", {}, el("td", { text: r.name }), el("td", { class: "r m", text: r.qty }), el("td", { class: "r m", text: money(r.revenue_cents, { decimals: 0 }) }),
            el("td", { class: "r m", text: r.qty_without_cost ? "sin costo" : money(r.cost_cents, { decimals: 0 }) }),
            el("td", { class: "r m", text: r.qty_without_cost ? "—" : money(r.profit_cents, { decimals: 0 }) }),
            el("td", { class: "r" }, m == null ? el("span", { class: "margin muted", text: "—" }) : el("span", { class: "margin " + (m < 0.3 ? "low" : "ok"), text: Math.round(m * 100) + "%" })));
        })))));
      out.push(card);
    }
    return out;
  }

  // Columnas: vendido por semana (una sola serie), con tooltip y tabla alterna.
  function renderWeeksChart(card, weeks) {
    const cur = ymd(weekStart(today()));
    const toggle = el("button", { class: "btn sm ghost", type: "button", text: "Ver tabla" });
    const box = el("div", { class: "chart" });
    const table = el("div", { class: "tablewrap", hidden: true }, el("table", {},
      el("thead", {}, el("tr", {}, ["Semana", "Pedidos", "Vendido", "Cobrado"].concat(isAdmin() ? ["Ganancia"] : []).map((h, i) => el("th", { class: i ? "r" : null, text: h })))),
      el("tbody", {}, [...weeks].reverse().map(w => el("tr", {}, el("td", { text: weekLabel(w.start, w.end) }), el("td", { class: "r m", text: w.orders }),
        el("td", { class: "r m", text: money(w.sold_cents, { decimals: 0 }) }), el("td", { class: "r m", text: money(w.collected_cents, { decimals: 0 }) }),
        isAdmin() ? el("td", { class: "r m", text: money(w.profit_cents, { decimals: 0 }) }) : null)))));
    toggle.addEventListener("click", () => { const show = table.hidden; table.hidden = !show; box.hidden = show; toggle.textContent = show ? "Ver gráfica" : "Ver tabla"; });
    const total = weeks.reduce((a, w) => a + w.sold_cents, 0);
    card.append(el("div", { class: "row between" }, el("div", {}, el("h2", { text: "Vendido por semana" }), el("span", { class: "small muted mono", text: `últimas 12 semanas · ${money(total, { decimals: 0 })}` })), toggle), box, table);

    const draw = () => {
      box.textContent = "";
      const W = Math.max(280, box.clientWidth || 600), H = 220, ml = 52, mr = 6, mt = 14, mb = 26;
      const max = Math.max(...weeks.map(w => w.sold_cents), 0);
      const step = niceStep(max / 4 || 10000);
      const top = Math.max(step, Math.ceil(max / step) * step);
      const y = v => mt + (H - mt - mb) * (1 - v / top);
      const band = (W - ml - mr) / weeks.length;
      const bw = Math.min(24, band * 0.62);
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Vendido por semana, últimas 12 semanas" });
      const grid = svg("g", { class: "grid" }), axis = svg("g", { class: "axis" });
      for (let v = 0; v <= top; v += step) {
        grid.append(svg("line", { x1: ml, x2: W - mr, y1: y(v), y2: y(v) }));
        const t = svg("text", { x: ml - 8, y: y(v) + 4, "text-anchor": "end" }); t.textContent = money(v, { decimals: 0 }); axis.append(t);
      }
      const every = Math.ceil(weeks.length / Math.max(1, Math.floor((W - ml) / 58)));
      const tip = el("div", { class: "tip", hidden: true });
      const bars = svg("g");
      weeks.forEach((w, i) => {
        const x = ml + i * band + (band - bw) / 2, base = y(0), yt = y(w.sold_cents), h = base - yt;
        const hit = svg("rect", { class: "hit", x: ml + i * band, y: mt, width: band, height: H - mt - mb, tabindex: 0, "aria-label": `${weekLabel(w.start, w.end)}: ${money(w.sold_cents)}` });
        const r = Math.min(4, h, bw / 2);
        const bar = h > 0 ? svg("path", { class: "bar" + (w.start === cur ? " on" : ""), d: `M${x},${base} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${base} Z` }) : svg("g");
        const show = () => {
          tip.textContent = "";
          tip.append(el("div", { class: "mono small", text: weekLabel(w.start, w.end) }), el("b", { text: money(w.sold_cents) }),
            el("div", { class: "small", text: `${w.orders} pedidos · cobrado ${money(w.collected_cents, { decimals: 0 })}` }));
          tip.hidden = false; tip.style.left = (x + bw / 2) + "px"; tip.style.top = (Math.min(yt, base) - 8) + "px";
        };
        hit.addEventListener("mouseenter", show); hit.addEventListener("focus", show); hit.addEventListener("click", show);
        hit.addEventListener("mouseleave", () => (tip.hidden = true)); hit.addEventListener("blur", () => (tip.hidden = true));
        bars.append(hit, bar);
        if (i % every === (weeks.length - 1) % every) {
          const t = svg("text", { x: x + bw / 2, y: H - 6, "text-anchor": "middle" }); t.textContent = dm(w.start);
          if (w.start === cur) t.setAttribute("font-weight", "700");
          axis.append(t);
        }
      });
      s.append(grid, axis, bars);
      box.append(s, tip);
    };
    requestAnimationFrame(draw);
    let rt; const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (box.isConnected) draw(); else window.removeEventListener("resize", onResize); }, 150); };
    window.addEventListener("resize", onResize);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  // ================= PEDIDOS =================
  async function viewPedidos() {
    const ws = currentWeek(), we = addDays(ws, 6);
    const q = S.orderFilter === "allpend" ? "?unpaid=1" : `?from=${ymd(ws)}&to=${ymd(we)}`;
    const [{ orders }] = await Promise.all([api("GET", "/api/orders" + q), S.settings.payment_note == null ? loadSettings() : null]);
    const list = el("div", { class: "orders" });
    const filters = [["all", "Todos"], ["pend", "Por cobrar"], ["undelivered", "Por entregar"], ["allpend", "Todo lo que me deben"]];
    const search = el("input", { type: "search", id: "order-search", placeholder: "Buscar cliente", value: S.search, "aria-label": "Buscar cliente" });
    const draw = () => {
      let rows = orders;
      if (S.orderFilter === "pend") rows = rows.filter(o => !o.paid);
      if (S.orderFilter === "undelivered") rows = rows.filter(o => !o.delivered);
      const term = S.search.trim().toLowerCase();
      if (term) rows = rows.filter(o => o.customer.name.toLowerCase().includes(term) || o.code.toLowerCase().includes(term));
      list.textContent = "";
      if (!rows.length) { list.append(el("div", { class: "empty", text: S.orderFilter === "allpend" ? "Nadie te debe nada." : "No hay pedidos con entrega en esta semana." })); return; }
      if (S.orderFilter === "allpend") list.append(el("div", { class: "dayhead", text: `${rows.length} pedidos · ${money(rows.reduce((a, o) => a + o.total_cents, 0))} por cobrar` }));
      let last = null;
      for (const o of rows) {
        if (S.orderFilter !== "allpend" && o.delivery_date !== last) { last = o.delivery_date; list.append(el("div", { class: "dayhead", text: dayShort(o.delivery_date) })); }
        list.append(orderCard(o, rerender));
      }
    };
    search.addEventListener("input", () => { S.search = search.value; draw(); });
    draw();
    return [
      pageHead("Pedidos", S.orderFilter === "allpend" ? null : weekNav(ws, rerender), el("a", { class: "btn primary", href: "#/nuevo", text: "Nuevo pedido" })),
      el("div", { class: "row between" },
        el("div", { class: "chips", role: "group", "aria-label": "Filtro" }, filters.map(([id, label]) =>
          el("button", { type: "button", class: "chip", "aria-pressed": String(S.orderFilter === id), text: label, onclick: () => { S.orderFilter = id; rerender(); } }))),
        el("div", { class: "grow" }, search)),
      list,
    ];
  }

  function orderCard(o, onChange) {
    const card = el("article", { class: "order" + (o.paid ? "" : " pend") });
    const confirm = el("div", { class: "confirm", hidden: true });
    const ask = (label, buttons) => { confirm.textContent = ""; confirm.append(el("span", { class: "small", text: label }), ...buttons, el("button", { type: "button", class: "btn sm ghost", text: "Cancelar", onclick: () => (confirm.hidden = true) })); confirm.hidden = false; };
    const status = async (patch, msg) => { if (await act(() => api("POST", `/api/orders/${o.id}/status`, patch), msg)) onChange(); };
    const msgBox = el("div", { class: "ticket", hidden: true });
    const acts = el("div", { class: "acts" },
      !o.paid ? el("button", { type: "button", class: "btn sm primary", text: "Cobrado", onclick: () => ask("¿Cómo te pagó?", [
        el("button", { type: "button", class: "btn sm", text: "Transferencia", onclick: () => status({ paid: true, payment_method: "transferencia" }, "Marcado como pagado") }),
        el("button", { type: "button", class: "btn sm", text: "Efectivo", onclick: () => status({ paid: true, payment_method: "efectivo" }, "Marcado como pagado") })]) }) : null,
      !o.delivered ? el("button", { type: "button", class: "btn sm", text: "Entregado", onclick: () => status({ delivered: true }, "Marcado como entregado") }) : null,
      el("button", { type: "button", class: "btn sm", text: "Mensaje", onclick: () => { const m = buildMessage(o); msgBox.textContent = m; msgBox.hidden = !msgBox.hidden; if (!msgBox.hidden) copyText(m, msgBox); } }),
      el("a", { class: "btn sm", href: waUrl(o.customer.phone, buildMessage(o)), target: "_blank", rel: "noopener", text: "WhatsApp" }),
      el("a", { class: "btn sm ghost", href: "#/pedido/" + o.id, text: "Editar" }),
      o.paid ? el("button", { type: "button", class: "btn sm ghost", text: "Quitar pago", onclick: () => ask("¿Regresar a por cobrar?", [el("button", { type: "button", class: "btn sm", text: "Sí", onclick: () => status({ paid: false }, "Regresado a por cobrar") })]) }) : null,
      o.delivered ? el("button", { type: "button", class: "btn sm ghost", text: "No entregado", onclick: () => status({ delivered: false }) }) : null,
      isAdmin() ? el("button", { type: "button", class: "btn sm danger", text: "Borrar", onclick: () => ask("¿Borrar este pedido para siempre?", [
        el("button", { type: "button", class: "btn sm danger", text: "Borrar", onclick: async () => { if (await act(() => api("DELETE", "/api/orders/" + o.id), "Pedido borrado")) onChange(); } })]) }) : null);
    card.append(...[
      el("div", { class: "hd" }, el("a", { class: "who", href: "#/cliente/" + o.customer.id, text: o.customer.name }), el("span", { class: "amt num", text: money(o.total_cents) })),
      el("div", { class: "items", text: o.items.map(i => `${i.qty} ${i.name}`).join(" · ") + (o.shipping_cents ? ` · envío ${money(o.shipping_cents)}` : "") + (o.discount_cents ? ` · desc. ${money(o.discount_cents)}` : "") }),
      o.notes ? el("div", { class: "small", text: "Nota: " + o.notes }) : null,
      el("div", { class: "row" },
        el("span", { class: "pill " + (o.paid ? "paid" : "pend"), text: o.paid ? "Pagado · " + o.payment_method : "Por cobrar" }),
        o.delivered ? el("span", { class: "pill done", text: "Entregado" }) : null,
        o.source === "whatsapp" ? el("span", { class: "pill off", text: "WhatsApp" }) : null,
        el("span", { class: "small muted mono", text: o.code + " · " + dayShort(o.delivery_date) })),
      acts, confirm, msgBox].filter(Boolean));
    return card;
  }

  // ================= NUEVO / EDITAR PEDIDO =================
  function emptyForm() {
    return { id: null, code: null, customer: "", phone: "", qty: {}, prices: {}, delivery: ymd(addDays(today(), 1)), shipping: "", discount: "", pay: "", notes: "", raw: "", saved: null,
      source: "panel", waIds: [], waPhone: null, note: "" };
  }
  async function viewNuevo(id) {
    const [, , { customers }, order] = await Promise.all([
      loadProducts(), loadSettings(), api("GET", "/api/customers"), id ? api("GET", "/api/orders/" + Number(id)).then(r => r.order) : null,
    ]);
    if (order) {
      S.form = { ...emptyForm(), id: order.id, code: order.code, customer: order.customer.name, phone: order.customer.phone, delivery: order.delivery_date,
        shipping: order.shipping_cents ? order.shipping_cents / 100 : "", discount: order.discount_cents ? order.discount_cents / 100 : "",
        pay: order.paid ? order.payment_method : "", notes: order.notes, prevItems: order.items };
      for (const i of order.items) { S.form.qty[i.product_id] = (S.form.qty[i.product_id] || 0) + i.qty; S.form.prices[i.product_id] = i.price_cents; }
    } else if (!S.form || S.form.id || S.form.saved) S.form = emptyForm();
    const F = S.form;
    const phones = new Map(customers.map(c => [c.name.toLowerCase(), c.phone]));

    const productName = pid => (S.products.find(p => p.id === pid) || (F.prevItems || []).find(i => i.product_id === pid) || { name: pid }).name;
    const basePrice = pid => { const p = S.products.find(x => x.id === pid); if (p) return p.price_cents; const prev = (F.prevItems || []).find(i => i.product_id === pid); return prev ? prev.price_cents : 0; };
    const priceOf = pid => (F.prices[pid] != null ? F.prices[pid] : basePrice(pid));
    const totals = () => {
      const items = Object.entries(F.qty).filter(([, q]) => q > 0);
      const subtotal = items.reduce((a, [pid, q]) => a + q * priceOf(pid), 0);
      const ship = toCents(F.shipping) || 0, disc = toCents(F.discount) || 0;
      return { items, subtotal, ship, disc, total: Math.max(0, subtotal + ship - disc), pieces: items.reduce((a, [, q]) => a + q, 0) };
    };

    // --- piezas de la pantalla ---
    const picker = el("div", {});
    const summary = el("div", { class: "card" });
    const bar = el("div", { class: "orderbar" });
    const drawBar = () => {
      const t = totals();
      bar.textContent = "";
      bar.append(el("div", { class: "in" }, el("div", {}, el("div", { class: "tot num", text: money(t.total) }), el("div", { class: "sub", text: `${t.pieces} ${t.pieces === 1 ? "panencio" : "panencios"}` + (t.ship ? ` · envío ${money(t.ship)}` : "") })),
        el("button", { class: "btn primary", type: "button", text: F.id ? "Guardar cambios" : "Guardar pedido", onclick: save })));
      bar.hidden = !t.pieces && !F.id;
    };
    const drawPicker = () => {
      picker.textContent = "";
      const active = S.products.filter(p => p.active);
      const extra = Object.keys(F.qty).filter(pid => F.qty[pid] > 0 && !active.some(p => p.id === pid));
      for (const [cat, label] of CATS) {
        const ps = active.filter(p => p.category === cat);
        if (ps.length) picker.append(el("div", { class: "cat" }, el("div", { class: "eyebrow", text: label }), ps.map(p => prodRow(p.id, p.name, p.unit))));
      }
      if (extra.length) picker.append(el("div", { class: "cat" }, el("div", { class: "eyebrow", text: "Fuera del menú" }), extra.map(pid => prodRow(pid, productName(pid)))));
    };
    const prodRow = (pid, name, unit) => {
      const q = F.qty[pid] || 0;
      const special = F.prices[pid] != null && F.prices[pid] !== basePrice(pid);
      const priceBox = el("div", {});
      const showPrice = () => {
        priceBox.textContent = "";
        priceBox.append(el("button", { type: "button", class: "pr" + (special ? " special" : ""), title: "Cambiar precio para este pedido", text: money(priceOf(pid)) + (unit ? " · " + unit : "") + (special ? " · precio especial" : ""),
          onclick: () => {
            const inp = el("input", { type: "number", min: "0", step: "0.5", value: priceOf(pid) / 100, "aria-label": "Precio de " + name, inputmode: "decimal" });
            const ok = () => { const c = toCents(inp.value); if (c != null && c >= 0) F.prices[pid] = c; drawAll(); };
            priceBox.textContent = "";
            priceBox.append(el("div", { class: "pr-edit" }, el("span", { class: "mono small", text: "$" }), inp, el("button", { type: "button", class: "btn sm", text: "OK", onclick: ok }),
              special ? el("button", { type: "button", class: "btn sm ghost", text: "Normal", onclick: () => { delete F.prices[pid]; drawAll(); } }) : null));
            inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
            inp.focus(); inp.select();
          } }));
      };
      showPrice();
      return el("div", { class: "prod" + (q ? " on" : "") },
        el("div", {}, el("div", { class: "nm", text: name }), priceBox),
        el("div", { class: "stepper" },
          el("button", { type: "button", class: "minus", "aria-label": "Quitar " + name, text: "−", onclick: () => setQty(pid, q - 1) }),
          el("output", { text: q }),
          el("button", { type: "button", "aria-label": "Agregar " + name, text: "+", onclick: () => setQty(pid, q + 1) })));
    };
    const setQty = (pid, q) => { if (q > 0) F.qty[pid] = q; else delete F.qty[pid]; drawAll(); };

    // cliente
    const cust = el("input", { type: "text", id: "f-customer", list: "f-customers", value: F.customer, placeholder: "Nombre o apodo", autocomplete: "off" });
    const phone = el("input", { type: "tel", id: "f-phone", value: F.phone, placeholder: "55 1234 5678", inputmode: "tel" });
    cust.addEventListener("input", () => (F.customer = cust.value));
    cust.addEventListener("change", () => { const ph = phones.get(cust.value.trim().toLowerCase()); if (ph && !phone.value) { phone.value = ph; F.phone = ph; } });
    phone.addEventListener("input", () => (F.phone = phone.value));
    const datalist = el("datalist", { id: "f-customers" }, customers.map(c => el("option", { value: c.name })));

    // entrega y pago
    const dateIn = el("input", { type: "date", id: "f-date", value: F.delivery });
    const dateChips = el("div", { class: "chips" });
    const drawDates = () => {
      dateChips.textContent = "";
      const t = today(); const opts = [["Hoy", t], ["Mañana", addDays(t, 1)]];
      for (const dow of [6, 0]) { let d = addDays(t, 1); while (d.getDay() !== dow) d = addDays(d, 1); if (!opts.some(([, x]) => ymd(x) === ymd(d))) opts.push([cap(DAYS[dow]) + " " + d.getDate(), d]); }
      for (const [lbl, d] of opts) dateChips.append(el("button", { type: "button", class: "chip", "aria-pressed": String(ymd(d) === F.delivery), text: lbl, onclick: () => { F.delivery = ymd(d); dateIn.value = F.delivery; drawDates(); } }));
    };
    dateIn.addEventListener("change", () => { F.delivery = dateIn.value; drawDates(); });
    const ship = el("input", { type: "number", id: "f-ship", min: "0", step: "1", inputmode: "decimal", placeholder: "0", value: F.shipping });
    const disc = el("input", { type: "number", id: "f-disc", min: "0", step: "1", inputmode: "decimal", placeholder: "0", value: F.discount });
    ship.addEventListener("input", () => { F.shipping = ship.value; drawAll(false); });
    disc.addEventListener("input", () => { F.discount = disc.value; drawAll(false); });
    const payChips = el("div", { class: "chips", role: "group", "aria-label": "Pago" });
    const drawPay = () => { payChips.textContent = ""; for (const [v, l] of [["", "Por cobrar"], ["transferencia", "Pagado · transferencia"], ["efectivo", "Pagado · efectivo"]]) payChips.append(el("button", { type: "button", class: "chip", "aria-pressed": String(F.pay === v), text: l, onclick: () => { F.pay = v; drawPay(); } })); };
    const notes = el("textarea", { id: "f-notes", placeholder: "Rebanado, sin ajonjolí, recoge a las 5…", value: F.notes });
    notes.addEventListener("input", () => (F.notes = notes.value));

    // pegar mensaje
    const paste = el("textarea", { id: "f-paste", placeholder: "Hola! me apartas 2 hogazas de hierbas y 4 galletas chocochips para el sábado?", value: F.raw });
    paste.addEventListener("input", () => (F.raw = paste.value));
    const parseNote = el("p", { class: "note small", hidden: !F.note, text: F.note });
    const pasteCard = el("details", { class: "card", open: F.source === "whatsapp" },
      el("summary", { text: F.source === "whatsapp" ? "Mensajes de WhatsApp" : "Pegar mensaje del cliente" }),
      el("p", { class: "muted small", text: F.source === "whatsapp" ? "Esto escribió por WhatsApp. Si corriges el texto, vuelve a convertirlo." : "Pega el mensaje como te llegó y lo convierto en pedido para que lo revises." }),
      paste,
      el("div", {}, el("button", { class: "btn", type: "button", text: "Convertir en pedido", onclick: () => {
        if (!paste.value.trim()) return toast("Pega primero el mensaje");
        const r = parseMessage(paste.value, S.products.filter(p => p.active));
        F.qty = r.items; if (r.date) { F.delivery = r.date; dateIn.value = r.date; }
        const n = Object.keys(r.items).length;
        let msg = n ? `Encontré ${n} ${n === 1 ? "producto" : "productos"}. Revisa cantidades.` : "No reconocí productos del menú. Agrégalos a mano.";
        if (r.unknown.length) msg += ` No reconocí: “${r.unknown.join("”, “")}”.`;
        if (r.date) msg += ` Entrega: ${dayShort(r.date)}.`;
        parseNote.textContent = msg; parseNote.hidden = false; drawDates(); drawAll();
      } })), parseNote);

    const drawSummary = () => {
      const t = totals();
      summary.textContent = "";
      summary.append(el("h2", { text: F.id ? "Editando " + F.code : "Resumen" }),
        t.items.length ? el("div", { class: "tablewrap" }, el("table", {}, el("tbody", {},
          t.items.map(([pid, q]) => el("tr", {}, el("td", { text: `${q} × ${productName(pid)}` }), el("td", { class: "r m", text: money(q * priceOf(pid)) }))),
          t.ship ? el("tr", {}, el("td", { text: "Envío" }), el("td", { class: "r m", text: money(t.ship) })) : null,
          t.disc ? el("tr", {}, el("td", { text: "Descuento" }), el("td", { class: "r m", text: "−" + money(t.disc) })) : null),
          el("tfoot", {}, el("tr", {}, el("td", { text: "Total" }), el("td", { class: "r m", text: money(t.total) }))))) : el("div", { class: "empty", text: "Toca + en los panencios." }),
        el("div", { class: "row" }, el("button", { class: "btn primary grow", type: "button", text: F.id ? "Guardar cambios" : "Guardar pedido", onclick: save }),
          F.id ? el("a", { class: "btn ghost", href: "#/pedidos", text: "Cancelar" }) : el("button", { class: "btn ghost", type: "button", text: "Limpiar", onclick: () => { S.form = emptyForm(); rerender(); } })));
    };
    function drawAll(withPicker = true) { if (withPicker) drawPicker(); drawSummary(); drawBar(); }

    async function save() {
      const t = totals();
      if (!F.customer.trim()) { cust.focus(); return toast("Escribe el nombre del cliente"); }
      if (!t.items.length) return toast("Agrega al menos un panencio");
      if (!F.delivery) return toast("Elige el día de entrega");
      const body = {
        customer: { name: F.customer.trim(), phone: F.phone.trim() },
        items: t.items.map(([pid, q]) => ({ product_id: pid, qty: q, price_cents: priceOf(pid) })),
        delivery_date: F.delivery, shipping_cents: t.ship, discount_cents: t.disc, notes: F.notes.trim(),
        raw_message: F.raw.trim() || null, paid: !!F.pay, payment_method: F.pay || null, source: F.source,
      };
      const r = await act(() => F.id ? api("PUT", "/api/orders/" + F.id, body) : api("POST", "/api/orders", body));
      if (!r) return;
      F.saved = r.order;
      if (F.waIds.length) {
        await act(() => api("POST", "/api/whatsapp/resolve", { ids: F.waIds, status: "pedido", order_id: r.order.id }));
        refreshBadge();
      }
      showSaved(r.order, !!F.id);
    }
    function showSaved(o, wasEdit) {
      const main = $("#main"); bar.remove();
      const msg = buildMessage(o);
      const ticket = el("div", { class: "ticket", text: msg });
      main.textContent = "";
      main.append(pageHead(wasEdit ? "Cambios guardados" : "Pedido guardado"),
        el("div", { class: "card" },
          el("div", { class: "row between" }, el("h2", { text: o.code + " · " + o.customer.name }), el("span", { class: "pill " + (o.paid ? "paid" : "pend"), text: o.paid ? "Pagado" : "Por cobrar" })),
          el("p", { class: "muted small", text: "Mándale este mensaje a tu cliente." }),
          ticket,
          el("div", { class: "row" },
            F.waPhone && S.waStatus && S.waStatus.sending ? el("button", { class: "btn primary", type: "button", text: "Enviar por WhatsApp", onclick: async ev => {
              const b = ev.currentTarget; b.disabled = true;
              if (await act(() => api("POST", "/api/whatsapp/send", { phone: F.waPhone, text: msg }), "Enviado por WhatsApp")) b.textContent = "Enviado"; else b.disabled = false;
            } }) : null,
            el("button", { class: "btn" + (F.waPhone && S.waStatus && S.waStatus.sending ? "" : " primary"), type: "button", text: "Copiar mensaje", onclick: () => copyText(msg, ticket) }),
            el("a", { class: "btn", href: waUrl(o.customer.phone, msg), target: "_blank", rel: "noopener", text: "Abrir WhatsApp" }),
            el("button", { class: "btn ghost", type: "button", text: "Nuevo pedido", onclick: () => { S.form = emptyForm(); if (location.hash === "#/nuevo") rerender(); else location.hash = "#/nuevo"; } }),
            el("a", { class: "btn ghost", href: "#/pedidos", text: "Ver pedidos" })),
          el("p", { class: "muted small", text: o.customer.phone ? "Si el botón de WhatsApp no abre, copia el mensaje y pégalo en el chat." : "Sin número: WhatsApp te pedirá elegir el chat." })));
      window.scrollTo(0, 0);
    }

    drawDates(); drawPay(); drawAll();
    document.body.append(bar);
    return [
      pageHead(F.id ? "Editar pedido" : "Nuevo pedido"),
      el("div", { class: "formcols" },
        el("div", { class: "view-col" }, F.id ? null : pasteCard, el("div", { class: "card" }, el("h2", { text: "Panencios" }), picker)),
        el("div", { class: "view-col sticky" },
          el("div", { class: "card" }, el("h2", { text: "Cliente" }),
            el("div", { class: "row" },
              el("div", { class: "field grow" }, el("label", { for: "f-customer", text: "Nombre" }), cust),
              el("div", { class: "field grow" }, el("label", { for: "f-phone", text: "WhatsApp (opcional)" }), phone)), datalist),
          el("div", { class: "card" }, el("h2", { text: "Entrega y pago" }),
            el("div", { class: "field" }, el("label", { for: "f-date", text: "Día de entrega" }), dateChips, dateIn),
            el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "f-ship", text: "Envío ($)" }), ship), el("div", { class: "field grow" }, el("label", { for: "f-disc", text: "Descuento ($)" }), disc)),
            el("div", { class: "field" }, el("label", { text: "Pago" }), payChips),
            el("div", { class: "field" }, el("label", { for: "f-notes", text: "Notas" }), notes)),
          summary)),
    ];
  }

  // Convierte un mensaje libre en cantidades del menú.
  const NUMWORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12 };
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "me", "mi", "un", "una", "uno", "porfa", "favor", "hola", "quiero", "quisiera", "apartas", "aparta", "pedir", "pido", "dame", "tienes", "hay", "pz", "pza", "pzas", "piezas", "pieza", "que", "se", "lo", "al", "en", "a"]);
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
  const stem = w => (w.length > 4 ? w.replace(/(es|s)$/, "") : w);
  const DATEWORDS = new Set(["hoy", "manana", "pasado", "sabado", "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "entrega", "recoger", "recojo", "semana", "gracias", "porfavor"].map(stem));
  // Saludos y plática que no son productos: no se reportan como "no reconocido".
  const CHAT = new Set(["buenas", "buenos", "tardes", "dias", "noches", "gracias", "saludos", "que", "tal", "como", "estas", "oye", "disculpa", "perdon", "ok", "va", "sale", "si", "no", "bueno"].map(stem));
  const isChat = w => DATEWORDS.has(w) || CHAT.has(w) || /^hol+a+s?$/.test(w) || /^j[aeiou]j/.test(w);
  const tokens = s => norm(s).split(" ").filter(w => w && !STOP.has(w)).map(stem);
  function parseMessage(text, menu) {
    const items = {}, unknown = [];
    const chunks = String(text).split(/[\n,;+]/).map(c => norm(c).replace(/\bajo y parm/g, "ajo parm")).flatMap(c => c.split(/\s(?:y|e|mas|tambien)\s/)).map(c => c.trim()).filter(Boolean);
    for (const ch of chunks) {
      let qty = 1; const m = ch.match(/(\d+)/);
      if (m) qty = +m[1];
      else if (/media docena/.test(ch)) qty = 6;
      else for (const w of ch.split(" ")) if (NUMWORDS[w]) { qty = NUMWORDS[w]; break; }
      const tk = tokens(ch.replace(/\d+/g, " "));
      if (!tk.length) continue;
      let best = null, score = 0;
      for (const p of menu) for (const key of [p.name, ...(p.aliases || [])].map(tokens)) {
        const hit = key.filter(k => tk.includes(k)).length;
        if (!hit) continue;
        const s = hit / key.length + hit * 0.01;
        if (s > score) { score = s; best = p; }
      }
      if (best && score >= 0.34) items[best.id] = (items[best.id] || 0) + qty;
      else if (tk.some(w => w.length > 3 && !isChat(w))) unknown.push(ch);
    }
    let date = null; const t = norm(text); const base = today();
    if (/\bpasado manana\b/.test(t)) date = addDays(base, 2);
    else if (/\bmanana\b/.test(t)) date = addDays(base, 1);
    else if (/\bhoy\b/.test(t)) date = base;
    else DAYS.forEach((d, i) => { if (!date && new RegExp("\\b" + norm(d) + "\\b").test(t)) { let x = addDays(base, 1); while (x.getDay() !== i) x = addDays(x, 1); date = x; } });
    return { items, date: date && ymd(date), unknown };
  }


  // ================= BANDEJA DE WHATSAPP =================
  function setBadge(n) { document.querySelectorAll('[data-badge="wa"]').forEach(b => { b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); }); }
  async function refreshBadge() {
    try { const r = await api("GET", "/api/whatsapp/inbox"); S.waStatus = r.status; setBadge(r.threads.reduce((a, t) => a + t.messages.length, 0)); } catch {}
  }
  setInterval(() => { if (S.me && document.visibilityState === "visible") refreshBadge(); }, 60_000);

  async function viewBandeja() {
    const [{ threads, status }] = await Promise.all([api("GET", "/api/whatsapp/inbox"), loadProducts(), loadSettings()]);
    S.waStatus = status;
    setBadge(threads.reduce((a, t) => a + t.messages.length, 0));
    const active = S.products.filter(p => p.active);
    const byRetail = id => S.products.find(p => p.wa_retailer_id === id) || S.products.find(p => p.id === id);
    const pname = pid => (S.products.find(p => p.id === pid) || { name: pid }).name;

    // Solo los carritos del catálogo traen productos exactos. El texto libre no se interpreta: se lee y se captura a mano.
    const detect = t => {
      const qty = {}, prices = {}, unknown = [];
      const carts = t.messages.filter(m => m.type === "order");
      for (const m of carts) for (const i of m.items || []) {
        const p = byRetail(i.retailer_id);
        if (!p) { unknown.push("producto del catálogo " + i.retailer_id); continue; }
        qty[p.id] = (qty[p.id] || 0) + i.qty;
        if (i.price_cents && i.price_cents !== p.price_cents) prices[p.id] = i.price_cents;
      }
      return { qty, prices, unknown, cart: carts.length > 0 };
    };

    const threadCard = t => {
      const name = t.customer ? t.customer.name : (t.profile_name || "");
      const d = detect(t);
      const found = Object.entries(d.qty).map(([pid, q]) => `${q} ${pname(pid)}`).join(" · ");
      const summary = d.cart ? (found ? `Carrito: ${found}` : "El carrito no trae productos del menú.") : "Mensaje de texto: al crear el pedido, elige los panencios.";
      const confirm = el("div", { class: "confirm", hidden: true });
      const ids = t.messages.map(m => m.id);
      return el("article", { class: "order pend" },
        el("div", { class: "hd" }, el("span", { class: "who", text: name || "Sin nombre" }), el("span", { class: "small muted mono", text: "+" + t.phone })),
        t.customer ? el("div", {}, el("span", { class: "pill paid", text: "Cliente registrado" })) : t.profile_name ? el("div", { class: "small muted", text: "Nombre en WhatsApp: " + t.profile_name }) : null,
        el("div", { class: "msgs" }, t.messages.map(m => el("div", { class: "msg" },
          el("time", { text: when(m.received_at) }),
          m.type === "order"
            ? el("div", {}, el("div", { class: "eyebrow", text: "Carrito del catálogo" }),
                el("ul", {}, (m.items || []).map(i => { const p = byRetail(i.retailer_id); return el("li", { text: `${i.qty} × ${p ? p.name : i.retailer_id} — ${money(i.qty * i.price_cents)}` }); })),
                m.body ? el("p", { text: m.body }) : null)
            : el("p", { class: m.type === "otro" ? "muted" : null, text: m.body })))),
        el("div", { class: d.cart ? "note small" : "small muted", text: summary }),
        d.unknown.length ? el("p", { class: "small muted", text: "No reconocí: " + d.unknown.join(", ") }) : null,
        el("div", { class: "acts" },
          el("button", { class: "btn sm primary", type: "button", text: "Crear pedido", onclick: () => {
            S.form = { ...emptyForm(), customer: name, phone: t.phone.replace(/\D/g, "").slice(-10), qty: d.qty, prices: d.prices,
              raw: t.messages.filter(m => m.body && m.type !== "otro").map(m => m.body).join("\n"),
              source: "whatsapp", waIds: ids, waPhone: t.phone, note: d.cart ? summary.replace(/\.?$/, ".") + " Elige el día de entrega y guarda." : "" };
            location.hash = "#/nuevo";
          } }),
          el("a", { class: "btn sm", href: "https://wa.me/" + t.phone, target: "_blank", rel: "noopener", text: "Abrir chat" }),
          el("button", { class: "btn sm ghost", type: "button", text: "Descartar", onclick: () => {
            confirm.textContent = "";
            confirm.append(el("span", { class: "small", text: `¿Sacar ${ids.length === 1 ? "este mensaje" : "estos " + ids.length + " mensajes"} de la bandeja sin crear pedido?` }),
              el("button", { class: "btn sm", type: "button", text: "Sí, descartar", onclick: async () => { if (await act(() => api("POST", "/api/whatsapp/resolve", { ids, status: "descartado" }), "Descartado")) rerender(); } }),
              el("button", { class: "btn sm ghost", type: "button", text: "Cancelar", onclick: () => (confirm.hidden = true) }));
            confirm.hidden = false;
          } })),
        confirm);
    };

    const out = [pageHead("Bandeja de WhatsApp")];
    if (!status.receiving) {
      out.push(el("div", { class: "card" }, el("h2", { text: "Falta conectar WhatsApp" }),
        el("p", { text: "Cuando conectes tu número de WhatsApp Business con la plataforma de Meta, aquí van a llegar solos los mensajes y los carritos del catálogo, listos para convertirse en pedido con un toque." }),
        el("p", { class: "muted small", text: "Los pasos están en docs/whatsapp.md del repositorio." })));
      return out;
    }
    out.push(el("p", { class: "muted", text: "Mensajes que todavía no son pedido. Los pedidos que hacen con el menú de WhatsApp (escribiendo MENÚ) no pasan por aquí: se registran solos en Pedidos." }));
    if (!status.sending) out.push(el("p", { class: "note small", text: "Recibir ya funciona. Para contestar desde el panel falta configurar el envío (WA_TOKEN y WA_PHONE_NUMBER_ID)." }));
    if (!threads.length) out.push(el("div", { class: "empty", text: "No hay mensajes pendientes." }));
    else out.push(el("div", { class: "orders" }, threads.map(threadCard)));
    return out;
  }

  // ================= CLIENTES =================
  async function viewClientes() {
    const { customers } = await api("GET", "/api/customers");
    const search = el("input", { type: "search", placeholder: "Buscar cliente", "aria-label": "Buscar cliente" });
    const body = el("tbody");
    const draw = () => {
      const term = search.value.trim().toLowerCase();
      body.textContent = "";
      const rows = customers.filter(c => !term || c.name.toLowerCase().includes(term) || c.phone.includes(term));
      if (!rows.length) body.append(el("tr", {}, el("td", { colspan: 6, class: "muted", text: "Sin clientes." })));
      for (const c of rows) body.append(el("tr", { class: "link", onclick: () => (location.hash = "#/cliente/" + c.id) },
        el("td", {}, el("b", { text: c.name })), el("td", { class: "m small", text: c.phone || "—" }), el("td", { class: "r m", text: c.orders }),
        el("td", { class: "r m", text: money(c.spent_cents, { decimals: 0 }) }),
        el("td", { class: "r" }, c.owed_cents ? el("span", { class: "pill pend", text: money(c.owed_cents) }) : el("span", { class: "muted small", text: "—" })),
        el("td", { class: "small muted", text: c.last_order ? dayShort(c.last_order) : "—" })));
    };
    search.addEventListener("input", draw); draw();
    const owed = customers.reduce((a, c) => a + c.owed_cents, 0);
    return [pageHead("Clientes"),
      el("p", { class: "muted", text: `${customers.length} clientes${owed ? ` · te deben ${money(owed)} en total` : ""}. Se agregan solos al guardar pedidos.` }),
      el("div", { class: "card" }, search, el("div", { class: "tablewrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ["Cliente", "WhatsApp", "Pedidos", "Gastado", "Debe", "Último pedido"].map((h, i) => el("th", { class: i >= 2 && i <= 4 ? "r" : null, text: h })))), body)))];
  }

  async function viewCliente(id) {
    const cid = Number(id);
    const [{ customers }, { orders }] = await Promise.all([api("GET", "/api/customers"), api("GET", "/api/orders?customer=" + cid), loadSettings()]);
    const c = customers.find(x => x.id === cid);
    if (!c) throw new Error("Ese cliente no existe.");
    const name = el("input", { type: "text", id: "c-name", value: c.name });
    const phone = el("input", { type: "tel", id: "c-phone", value: c.phone });
    const notes = el("textarea", { id: "c-notes", value: c.notes, placeholder: "Le gusta rebanado, vive en el 304…" });
    const list = el("div", { class: "orders" });
    const sorted = [...orders].sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
    if (!sorted.length) list.append(el("div", { class: "empty", text: "Sin pedidos." }));
    for (const o of sorted) list.append(orderCard(o, rerender));
    return [
      pageHead(c.name, el("a", { class: "btn ghost", href: "#/clientes", text: "Todos los clientes" })),
      el("div", { class: "kpis" },
        el("div", { class: "kpi hl" }, el("span", { class: "label", text: "Gastado" }), el("span", { class: "v", text: money(c.spent_cents, { decimals: 0 }) })),
        el("div", { class: "kpi" }, el("span", { class: "label", text: "Pedidos" }), el("span", { class: "v", text: c.orders })),
        el("div", { class: "kpi" }, el("span", { class: "label", text: "Debe" }), el("span", { class: "v", text: money(c.owed_cents, { decimals: 0 }) })),
        el("div", { class: "kpi" }, el("span", { class: "label", text: "Último pedido" }), el("span", { class: "v", text: c.last_order ? dm(c.last_order) : "—" }))),
      el("div", { class: "card" }, el("h2", { text: "Datos" }),
        el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "c-name", text: "Nombre" }), name), el("div", { class: "field grow" }, el("label", { for: "c-phone", text: "WhatsApp" }), phone)),
        el("div", { class: "field" }, el("label", { for: "c-notes", text: "Notas" }), notes),
        el("div", {}, el("button", { class: "btn primary", type: "button", text: "Guardar", onclick: async () => {
          if (await act(() => api("PATCH", "/api/customers/" + cid, { name: name.value, phone: phone.value, notes: notes.value }), "Cliente guardado")) rerender();
        } }))),
      el("h2", { text: "Pedidos" }), list];
  }

  // ================= MENÚ =================
  async function viewMenu() {
    await Promise.all([loadProducts(), loadSettings(), refreshBadge()]);
    const admin = isAdmin();
    if (!admin) {
      return [pageHead("Menú"), el("div", { class: "card" }, el("div", { class: "tablewrap" }, el("table", {},
        el("thead", {}, el("tr", {}, el("th", { text: "Panencio" }), el("th", { text: "Sección" }), el("th", { class: "r", text: "Precio" }))),
        el("tbody", {}, S.products.filter(p => p.active).map(p => el("tr", {}, el("td", { text: p.name }), el("td", { class: "small muted", text: CATS.find(c => c[0] === p.category)[1] }), el("td", { class: "r m", text: money(p.price_cents) })))))))];
    }
    const patch = async (p, field, value) => {
      const r = await act(() => api("PATCH", "/api/products/" + p.id, { [field]: value }), "Guardado");
      if (r) { Object.assign(p, r.product); drawRows(); }
    };
    const body = el("tbody");
    const drawRows = () => {
      body.textContent = "";
      for (const p of S.products) {
        const margin = p.cost_cents != null && p.price_cents ? (p.price_cents - p.cost_cents) / p.price_cents : null;
        body.append(el("tr", { class: "menu-row" },
          el("td", { class: "w-name" }, el("input", { type: "text", value: p.name, "aria-label": "Nombre", onchange: e => patch(p, "name", e.target.value) })),
          el("td", {}, el("select", { "aria-label": "Sección", onchange: e => patch(p, "category", e.target.value) }, CATS.map(([v, l]) => { const o = el("option", { value: v, text: l }); o.selected = p.category === v; return o; }))),
          el("td", { class: "w-price" }, el("input", { type: "number", min: "0", step: "0.5", value: p.price_cents / 100, "aria-label": "Precio", onchange: e => patch(p, "price_cents", toCents(e.target.value) || 0) })),
          el("td", { class: "w-price" }, el("input", { type: "number", min: "0", step: "0.01", value: p.cost_cents == null ? "" : p.cost_cents / 100, placeholder: "—", "aria-label": "Costo", onchange: e => patch(p, "cost_cents", toCents(e.target.value)) })),
          el("td", { class: "r" }, margin == null ? el("span", { class: "margin muted", text: "sin costo" }) : el("span", { class: "margin " + (margin < 0.3 ? "low" : "ok"), text: `${Math.round(margin * 100)}% · ${money(p.price_cents - p.cost_cents)}` })),
          el("td", {}, el("label", { class: "row small" }, el("input", { type: "checkbox", checked: p.active, onchange: e => patch(p, "active", e.target.checked) }), "En venta")),
          el("td", {}, el("input", { type: "text", value: p.aliases.join(", "), placeholder: "otras formas de pedirlo", "aria-label": "Otras formas de pedirlo", onchange: e => patch(p, "aliases", e.target.value.split(",").map(s => s.trim()).filter(Boolean)) })),
          el("td", { class: "w-price" }, el("input", { type: "text", value: p.wa_retailer_id || "", placeholder: p.id, "aria-label": "ID en el catálogo de WhatsApp", onchange: e => patch(p, "wa_retailer_id", e.target.value.trim()) }))));
      }
    };
    drawRows();
    const nName = el("input", { type: "text", id: "n-name", placeholder: "Panqué de plátano" });
    const nCat = el("select", { id: "n-cat" }, CATS.map(([v, l]) => el("option", { value: v, text: l })));
    const nPrice = el("input", { type: "number", id: "n-price", min: "0", step: "0.5" });
    const nCost = el("input", { type: "number", id: "n-cost", min: "0", step: "0.01" });
    const note = el("textarea", { id: "pay-note", value: S.settings.payment_note || "", placeholder: "Puedes pagar por transferencia a BBVA · CLABE 012… a nombre de…" });
    return [
      pageHead("Menú y costos"),
      el("p", { class: "muted", text: "Los cambios se guardan al salir de cada campo. Los pedidos ya guardados conservan el precio y el costo con que se vendieron. Solo administración ve los costos." }),
      el("div", { class: "card" }, el("div", { class: "tablewrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ["Panencio", "Sección", "Precio $", "Costo $", "Margen", "", "Cómo lo piden", "ID catálogo WA"].map((h, i) => el("th", { class: i === 4 ? "r" : null, text: h })))), body))),
      el("div", { class: "grid2" },
        el("div", { class: "card" }, el("h2", { text: "Agregar panencio" }),
          el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "n-name", text: "Nombre" }), nName), el("div", { class: "field grow" }, el("label", { for: "n-cat", text: "Sección" }), nCat)),
          el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "n-price", text: "Precio $" }), nPrice), el("div", { class: "field grow" }, el("label", { for: "n-cost", text: "Costo $" }), nCost)),
          el("div", {}, el("button", { class: "btn primary", type: "button", text: "Agregar al menú", onclick: async () => {
            if (!nName.value.trim() || !nPrice.value) return toast("Escribe nombre y precio");
            if (await act(() => api("POST", "/api/products", { name: nName.value, category: nCat.value, price_cents: toCents(nPrice.value), cost_cents: toCents(nCost.value), aliases: [], active: true }), "Agregado al menú")) rerender();
          } }))),
        waMenuCard(),
        el("div", { class: "card" }, el("h2", { text: "Mensaje de pago" }),
          el("p", { class: "muted small", text: "Va al final de cada pedido por cobrar que mandas." }), note,
          el("div", {}, el("button", { class: "btn primary", type: "button", text: "Guardar mensaje", onclick: () => act(() => api("PUT", "/api/settings", { payment_note: note.value }), "Mensaje guardado").then(ok => ok && (S.settings.payment_note = note.value.trim())) })))),
    ];
  }

  function waMenuCard() {
    const on = el("input", { type: "checkbox", id: "wa-menu", checked: S.settings.wa_menu === "1" });
    const current = new Set(String(S.settings.delivery_days ?? "0,1,2,3,4,5,6").split(",").filter(Boolean));
    const order = [1, 2, 3, 4, 5, 6, 0];
    const boxes = order.map(d => el("input", { type: "checkbox", id: "dd-" + d, value: String(d), checked: current.has(String(d)) }));
    return el("div", { class: "card" }, el("h2", { text: "Menú de WhatsApp" }),
      el("p", { class: "muted small", text: "Cuando alguien escribe MENÚ o PEDIDO, WhatsApp le muestra tus secciones y panencios con botones: elige producto, cantidad y día, y confirma. El pedido aparece solo en Pedidos como Por cobrar. No interpreta texto: solo cuenta lo que el cliente toca." }),
      S.waStatus && !S.waStatus.sending ? el("p", { class: "note small", text: "Para que funcione falta conectar el envío por WhatsApp (ver docs/whatsapp.md)." }) : null,
      el("label", { class: "row" }, on, "Contestar con el menú"),
      el("div", { class: "field" }, el("label", { text: "Días de entrega que se ofrecen" }),
        el("div", { class: "chips" }, order.map((d, i) => el("label", { class: "chip" }, boxes[i], " " + cap(DAYS[d]).slice(0, 3))))),
      el("p", { class: "muted small", text: "El cliente ve los próximos días marcados, a partir de mañana (máximo 7)." }),
      el("div", {}, el("button", { class: "btn primary", type: "button", text: "Guardar", onclick: async () => {
        const days = boxes.filter(b => b.checked).map(b => Number(b.value));
        if (await act(() => api("PUT", "/api/settings", { wa_menu: on.checked, delivery_days: days }), "Menú de WhatsApp guardado")) {
          S.settings.wa_menu = on.checked ? "1" : "0"; S.settings.delivery_days = days.sort().join(",");
        }
      } })));
  }

  // ================= USUARIOS =================
  async function viewUsuarios() {
    if (!isAdmin()) throw new Error("Solo administración puede ver esta sección.");
    const { users } = await api("GET", "/api/users");
    const body = el("tbody");
    for (const u of users) {
      const me = u.id === S.me.id;
      const extra = el("div", { class: "confirm", hidden: true });
      const role = el("select", { "aria-label": "Rol de " + u.name, disabled: me, onchange: async e => { if (await act(() => api("PATCH", "/api/users/" + u.id, { role: e.target.value }), "Rol cambiado")) rerender(); } },
        [["admin", "Administración"], ["staff", "Pedidos"]].map(([v, l]) => { const o = el("option", { value: v, text: l }); o.selected = u.role === v; return o; }));
      body.append(el("tr", {},
        el("td", {}, el("b", { text: u.name }), me ? el("span", { class: "muted small", text: " (tú)" }) : null, el("div", { class: "small muted mono", text: u.email }), extra),
        el("td", {}, role),
        el("td", {}, el("span", { class: "pill " + (u.disabled ? "off" : "paid"), text: u.disabled ? "Desactivado" : "Activo" })),
        el("td", { class: "small muted", text: u.last_login ? when(u.last_login) : "nunca" }),
        el("td", {}, el("div", { class: "acts" },
          el("button", { class: "btn sm ghost", type: "button", text: "Nueva contraseña", onclick: () => {
            const pw = el("input", { type: "text", placeholder: "mínimo 10 caracteres", "aria-label": "Nueva contraseña", autocomplete: "new-password" });
            extra.textContent = ""; extra.hidden = false;
            extra.append(pw, el("button", { class: "btn sm primary", type: "button", text: "Guardar", onclick: async () => { if (await act(() => api("PATCH", "/api/users/" + u.id, { password: pw.value }), "Contraseña cambiada; se cerraron sus sesiones")) rerender(); } }),
              el("button", { class: "btn sm ghost", type: "button", text: "Cancelar", onclick: () => (extra.hidden = true) }));
            pw.focus();
          } }),
          me ? null : el("button", { class: "btn sm " + (u.disabled ? "" : "danger"), type: "button", text: u.disabled ? "Activar" : "Desactivar", onclick: async () => { if (await act(() => api("PATCH", "/api/users/" + u.id, { disabled: !u.disabled }), u.disabled ? "Usuario activado" : "Usuario desactivado")) rerender(); } })))));
    }
    const nName = el("input", { type: "text", id: "u-name" }), nEmail = el("input", { type: "email", id: "u-email", autocomplete: "off" });
    const nRole = el("select", { id: "u-role" }, el("option", { value: "staff", text: "Pedidos (sin costos)" }), el("option", { value: "admin", text: "Administración" }));
    const nPass = el("input", { type: "text", id: "u-pass", autocomplete: "new-password", placeholder: "mínimo 10 caracteres" });
    return [
      pageHead("Usuarios"),
      el("p", { class: "muted", text: "Administración ve todo: costos, márgenes, usuarios y actividad. Pedidos crea y cobra pedidos, sin ver costos ni borrar." }),
      el("div", { class: "card" }, el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Persona", "Rol", "Estado", "Último acceso", ""].map(h => el("th", { text: h })))), body))),
      el("div", { class: "card" }, el("h2", { text: "Agregar persona" }),
        el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "u-name", text: "Nombre" }), nName), el("div", { class: "field grow" }, el("label", { for: "u-email", text: "Correo" }), nEmail)),
        el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", { for: "u-role", text: "Rol" }), nRole), el("div", { class: "field grow" }, el("label", { for: "u-pass", text: "Contraseña temporal" }), nPass)),
        el("p", { class: "muted small", text: "Compártele la contraseña en persona y pídele que la cambie en Mi cuenta." }),
        el("div", {}, el("button", { class: "btn primary", type: "button", text: "Agregar", onclick: async () => {
          if (await act(() => api("POST", "/api/users", { name: nName.value, email: nEmail.value, role: nRole.value, password: nPass.value }), "Persona agregada")) rerender();
        } }))),
    ];
  }

  // ================= ACTIVIDAD =================
  async function viewActividad() {
    if (!isAdmin()) throw new Error("Solo administración puede ver esta sección.");
    const { entries } = await api("GET", "/api/audit?limit=200");
    const describe = e => {
      const d = e.detail || {};
      if (e.entity === "order") return [d.code, d.cliente, d.total != null ? money(d.total) : null, d.pagado ? "pagado " + d.pagado : d.pagado === false ? "regresado a por cobrar" : null, d.entregado ? "entregado" : null].filter(Boolean).join(" · ");
      if (e.entity === "product") return [e.entity_id, d.price_cents != null ? "precio " + money(d.price_cents) : null, "cost_cents" in d ? "costo " + (d.cost_cents == null ? "—" : money(d.cost_cents)) : null, d.name].filter(Boolean).join(" · ");
      if (e.entity === "user") return [d.email, d.role, d.disabled === true ? "desactivado" : d.disabled === false ? "activado" : null, d.password].filter(Boolean).join(" · ");
      return "";
    };
    return [pageHead("Actividad"), el("p", { class: "muted", text: "Quién hizo qué, lo más reciente primero." }),
      el("div", { class: "card" }, entries.length ? el("div", { class: "log" }, entries.map(e => el("div", {},
        el("time", { text: when(e.at) }), el("span", {}, el("b", { text: e.user_name || (e.detail && e.detail.origen === "whatsapp" ? "Menú de WhatsApp" : "Sistema") }), " · ", e.action, describe(e) ? el("span", { class: "muted", text: " — " + describe(e) }) : null)))) : el("div", { class: "empty", text: "Sin actividad todavía." }))];
  }

  // ================= CUENTA / MÁS =================
  async function viewCuenta() {
    const cur = el("input", { type: "password", id: "p-cur", autocomplete: "current-password" });
    const nxt = el("input", { type: "password", id: "p-new", autocomplete: "new-password" });
    return [pageHead("Mi cuenta"),
      el("div", { class: "grid2" },
        el("div", { class: "card" }, el("h2", { text: S.me.name }), el("p", { class: "mono small", text: S.me.email }),
          el("p", { class: "muted small", text: S.me.role === "admin" ? "Administración: ves todo." : "Pedidos: creas y cobras pedidos." }),
          el("div", { class: "row" }, el("button", { class: "btn", type: "button", text: "Cerrar sesión", onclick: logout }),
            isAdmin() ? el("button", { class: "btn ghost", type: "button", text: "Descargar respaldo", onclick: downloadBackup }) : null)),
        el("div", { class: "card" }, el("h2", { text: "Cambiar contraseña" }),
          el("div", { class: "field" }, el("label", { for: "p-cur", text: "Contraseña actual" }), cur),
          el("div", { class: "field" }, el("label", { for: "p-new", text: "Nueva (mínimo 10 caracteres)" }), nxt),
          el("div", {}, el("button", { class: "btn primary", type: "button", text: "Cambiar", onclick: async () => {
            if (await act(() => api("POST", "/api/me/password", { current: cur.value, next: nxt.value }), "Contraseña cambiada. Se cerraron tus otras sesiones.")) { cur.value = ""; nxt.value = ""; }
          } }))))];
  }
  async function downloadBackup() {
    try {
      const res = await fetch("/api/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = el("a", { href: url, download: `panencia-respaldo-${ymd(today())}.json` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { toast("No se pudo descargar el respaldo"); }
  }
  async function viewMas() {
    const links = [["clientes", "Clientes"], ["menu", "Menú y costos"], ["usuarios", "Usuarios", true], ["actividad", "Actividad", true], ["cuenta", "Mi cuenta"]].filter(l => !l[2] || isAdmin());
    return [pageHead("Más"), el("div", { class: "card" }, el("div", { class: "links" }, links.map(([id, label]) => el("a", { href: "#/" + id, text: label })))),
      el("p", { class: "muted small", text: `Sesión de ${S.me.name}.` })];
  }

  // ================= arranque =================
  async function boot() {
    try { S.me = (await api("GET", "/api/me")).user; } catch { return; }
    renderShell();
    loadSettings().catch(() => {});
    refreshBadge();
    route();
  }
  boot();
})();
