(() => {
  const STORAGE_KEY = "obliviosa-tierlist-v1";
  const UNRANKED = "unranked";

  const showNames = window.SHOW_NAMES !== false;
  const tiers = window.TIERS || [];
  const cosplays = withIds(window.COSPLAYS || []);
  const byId = new Map(cosplays.map((c) => [c.id, c]));

  const tiersEl = document.getElementById("tiers");
  const unrankedEl = document.getElementById("unranked");
  const rackCountEl = document.getElementById("rack-count");
  const liveEl = document.getElementById("live");
  const bannerEl = document.getElementById("shared-banner");
  const shareBtn = document.getElementById("share");

  const zones = new Map();
  const counts = new Map();
  const cards = new Map();

  let sharedView = false;

  // ---- Data ----

  function slug(text) {
    return (
      String(text)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "cosplay"
    );
  }

  function withIds(list) {
    const seen = new Set();
    return list.map((c) => {
      const base = c.id ? String(c.id) : slug(c.name);
      let id = base;
      for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
      seen.add(id);
      return { ...c, id };
    });
  }

  // Drop unknown ids and duplicates; anything not placed goes to Unranked.
  function normalize(raw) {
    const state = {};
    const placed = new Set();
    for (const key of [...tiers.map((t) => t.id), UNRANKED]) {
      const ids = Array.isArray(raw?.[key]) ? raw[key] : [];
      state[key] = ids.filter((id) => byId.has(id) && !placed.has(id) && placed.add(id));
    }
    for (const c of cosplays) if (!placed.has(c.id)) state[UNRANKED].push(c.id);
    return state;
  }

  function loadSaved() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return normalize(null);
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode); the ranking still works for this visit.
    }
  }

  function encodeShare(state) {
    const ranked = {};
    for (const t of tiers) if (state[t.id].length) ranked[t.id] = state[t.id];
    const bytes = new TextEncoder().encode(JSON.stringify(ranked));
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeShare(code) {
    try {
      const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      return normalize(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return null;
    }
  }

  function readState() {
    const state = {};
    for (const [key, zone] of zones) {
      state[key] = [...zone.children].map((el) => el.dataset.id);
    }
    return state;
  }

  // ---- Rendering ----

  function tierName(key) {
    if (key === UNRANKED) return "Unranked";
    const t = tiers.find((t) => t.id === key);
    return `${t ? t.label : key} tier`;
  }

  function buildBoard() {
    for (const t of tiers) {
      const row = document.createElement("div");
      row.className = "tier";
      row.style.setProperty("--tier-color", t.color || "#FF6FAE");

      const tag = document.createElement("div");
      tag.className = "tag";
      const label = document.createElement("span");
      label.className = "tag-label";
      label.textContent = t.label;
      const count = document.createElement("span");
      count.className = "tag-count";
      tag.append(label, count);

      const zone = document.createElement("div");
      zone.className = "zone";
      zone.dataset.tier = t.id;
      zone.setAttribute("role", "list");
      zone.setAttribute("aria-label", tierName(t.id));

      row.append(tag, zone);
      tiersEl.append(row);
      zones.set(t.id, zone);
      counts.set(t.id, count);
    }

    unrankedEl.dataset.empty = cosplays.length
      ? "Everything's ranked."
      : "No cosplays yet. Add them in cosplays.js.";
    unrankedEl.setAttribute("role", "list");
    unrankedEl.setAttribute("aria-label", "Unranked");
    zones.set(UNRANKED, unrankedEl);

    for (const c of cosplays) cards.set(c.id, buildCard(c));
  }

  function buildCard(c) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.id = c.id;
    if (showNames) card.title = c.name;
    card.setAttribute("role", "listitem");

    const fallback = () => {
      const span = document.createElement("span");
      span.className = "card-fallback";
      span.setAttribute("aria-hidden", "true");
      span.textContent = initials(c.name);
      return span;
    };

    if (c.image) {
      const img = document.createElement("img");
      img.src = c.image;
      img.alt = "";
      img.draggable = false;
      img.loading = "lazy";
      if (c.position) img.style.objectPosition = c.position;
      img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
      card.append(img);
    } else {
      card.append(fallback());
    }

    if (showNames) {
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = c.name;
      card.append(name);
    }
    return card;
  }

  function initials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  function render(state) {
    for (const [key, zone] of zones) {
      zone.replaceChildren(...state[key].map((id) => cards.get(id)));
    }
    refreshLabels(state);
  }

  function refreshLabels(state) {
    for (const t of tiers) counts.get(t.id).textContent = state[t.id].length || "";
    const left = state[UNRANKED].length;
    rackCountEl.textContent = cosplays.length ? `${left} left to rank` : "";
    for (const [key, ids] of Object.entries(state)) {
      for (const id of ids) {
        cards.get(id).setAttribute("aria-label", `${byId.get(id).name}, ${tierName(key)}`);
      }
    }
  }

  function announce(text) {
    liveEl.textContent = "";
    requestAnimationFrame(() => (liveEl.textContent = text));
  }

  // ---- Commit changes ----

  function commit(movedCard) {
    const state = readState();
    if (sharedView) leaveSharedView();
    save(state);
    refreshLabels(state);
    if (movedCard) {
      const key = movedCard.parentElement.dataset.tier;
      announce(`${byId.get(movedCard.dataset.id).name} moved to ${tierName(key)}`);
    }
  }

  function enterSharedView(state) {
    sharedView = true;
    bannerEl.hidden = false;
    render(state);
  }

  function leaveSharedView() {
    sharedView = false;
    bannerEl.hidden = true;
    history.replaceState(null, "", location.pathname + location.search);
  }

  // ---- Pointer drag (mouse, pen, and long-press on touch) ----

  let drag = null;

  function onPointerDown(e) {
    const card = e.target.closest(".card");
    if (!card || card.classList.contains("ghost") || e.button > 0) return;
    drag = {
      card,
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType === "touch",
      active: false,
      timer: 0,
    };
    // On touch, a quick swipe should scroll the page; hold briefly to pick a card up.
    if (drag.touch) drag.timer = setTimeout(startDrag, 220);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", endDrag);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
      if (drag.touch) {
        if (dist > 10) endDrag();
        return;
      }
      if (dist < 5) return;
      startDrag();
    }
    positionGhost();
    placeCard();
  }

  function startDrag() {
    if (!drag || drag.active) return;
    const { card } = drag;
    const rect = card.getBoundingClientRect();
    drag.active = true;
    drag.offsetX = drag.startX - rect.left;
    drag.offsetY = drag.startY - rect.top;

    const ghost = card.cloneNode(true);
    ghost.classList.add("ghost");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);
    drag.ghost = ghost;

    card.classList.add("is-placeholder");
    document.body.classList.add("is-dragging");
    if (drag.touch) navigator.vibrate?.(10);
    positionGhost();
    autoScroll();
  }

  function positionGhost() {
    const { ghost, x, y, offsetX, offsetY } = drag;
    ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px)`;
  }

  // Move the real card to where it would land, so the layout previews the drop.
  function placeCard() {
    const zone = document.elementFromPoint(drag.x, drag.y)?.closest(".zone");
    if (!zone) return;
    const { card, x, y } = drag;
    let before = null;
    for (const other of zone.children) {
      if (other === card) continue;
      const r = other.getBoundingClientRect();
      if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) {
        before = other;
        break;
      }
    }
    if (card.parentElement === zone && card.nextElementSibling === before) return;
    if (before) zone.insertBefore(card, before);
    else zone.append(card);
  }

  function autoScroll() {
    if (!drag?.active) return;
    const edge = 70;
    let dy = 0;
    if (drag.y < edge) dy = -Math.ceil((edge - drag.y) / 5);
    else if (drag.y > innerHeight - edge) dy = Math.ceil((drag.y - (innerHeight - edge)) / 5);
    if (dy) {
      window.scrollBy(0, dy);
      placeCard();
    }
    requestAnimationFrame(autoScroll);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, active } = drag;
    endDrag();
    if (active) {
      card.classList.add("just-dropped");
      card.addEventListener("animationend", () => card.classList.remove("just-dropped"), { once: true });
      commit(card);
    }
  }

  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.ghost?.remove();
    drag.card.classList.remove("is-placeholder");
    document.body.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", endDrag);
    drag = null;
  }

  // Stop the page from scrolling under a card that's being dragged on touch screens.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (drag?.active) e.preventDefault();
    },
    { passive: false }
  );

  // Suppress the context menu that a long press would open on a card.
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".card")) e.preventDefault();
  });

  // ---- Keyboard ----

  function onKeyDown(e) {
    const card = e.target.closest(".card");
    if (!card || drag) return;
    const order = [...zones.keys()];
    const zone = card.parentElement;
    const zoneIndex = order.indexOf(zone.dataset.tier);

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const next = zoneIndex + (e.key === "ArrowUp" ? -1 : 1);
      if (next < 0 || next >= order.length) return;
      zones.get(order[next]).append(card);
    } else if (e.key === "ArrowLeft") {
      if (!card.previousElementSibling) return;
      zone.insertBefore(card, card.previousElementSibling);
    } else if (e.key === "ArrowRight") {
      if (!card.nextElementSibling) return;
      zone.insertBefore(card.nextElementSibling, card);
    } else {
      return;
    }
    e.preventDefault();
    card.focus();
    card.scrollIntoView({ block: "nearest" });
    commit(card);
  }

  // ---- Buttons ----

  shareBtn.addEventListener("click", async () => {
    const url = `${location.href.split("#")[0]}#r=${encodeShare(readState())}`;
    try {
      await navigator.clipboard.writeText(url);
      flash(shareBtn, "Link copied");
    } catch {
      window.prompt("Copy this link to share your ranking:", url);
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Move every cosplay back to Unranked?")) return;
    const state = normalize(null);
    if (sharedView) leaveSharedView();
    save(state);
    render(state);
    announce("All cosplays moved back to Unranked");
  });

  document.getElementById("keep-shared").addEventListener("click", () => {
    const state = readState();
    leaveSharedView();
    save(state);
    announce("Shared ranking saved as yours");
  });

  document.getElementById("leave-shared").addEventListener("click", () => {
    leaveSharedView();
    render(loadSaved());
  });

  function flash(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => (btn.textContent = original), 2000);
  }

  // ---- Start ----

  buildBoard();
  tiersEl.addEventListener("pointerdown", onPointerDown);
  unrankedEl.addEventListener("pointerdown", onPointerDown);
  document.getElementById("board").addEventListener("keydown", onKeyDown);

  const shared = location.hash.startsWith("#r=") ? decodeShare(location.hash.slice(3)) : null;
  if (shared) enterSharedView(shared);
  else render(loadSaved());
})();
