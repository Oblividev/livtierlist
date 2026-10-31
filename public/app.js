(() => {
  const STORAGE_KEY = "obliviosa-tierlist-v1";
  const UNRANKED = "unranked";

  const tiers = window.TIERS || [];
  const cosplays = window.COSPLAYS || [];
  const showNames = window.SHOW_NAMES !== false;
  const ids = new Set(cosplays.map((c) => c.id));

  const tiersEl = document.getElementById("tiers");
  const unrankedEl = document.getElementById("unranked");
  const bannerEl = document.getElementById("shared-banner");
  const shareBtn = document.getElementById("share");

  const zones = new Map();
  const counts = new Map();
  const cards = new Map();
  let sharedView = false;

  // ---- State ----

  // Drop unknown or repeated ids; anything not placed goes to Unranked.
  function normalize(raw) {
    const state = {};
    const placed = new Set();
    for (const key of [...tiers.map((t) => t.id), UNRANKED]) {
      const list = Array.isArray(raw?.[key]) ? raw[key] : [];
      state[key] = list.filter((id) => ids.has(id) && !placed.has(id) && placed.add(id));
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
    } catch {}
  }

  function readState() {
    const state = {};
    for (const [key, zone] of zones) state[key] = [...zone.children].map((el) => el.dataset.id);
    return state;
  }

  function encodeShare(state) {
    const ranked = {};
    for (const t of tiers) if (state[t.id].length) ranked[t.id] = state[t.id];
    return encodeURIComponent(JSON.stringify(ranked));
  }

  function decodeShare(code) {
    try {
      return normalize(JSON.parse(decodeURIComponent(code)));
    } catch {
      return null;
    }
  }

  // ---- Rendering ----

  function buildBoard() {
    for (const t of tiers) {
      const row = document.createElement("div");
      row.className = "tier";
      row.style.setProperty("--tier-color", t.color);
      row.innerHTML = `<div class="tag"><span class="tag-label"></span><span class="tag-count"></span></div><div class="zone"></div>`;
      row.querySelector(".tag-label").textContent = t.label;
      const zone = row.querySelector(".zone");
      zone.dataset.tier = t.id;
      tiersEl.append(row);
      zones.set(t.id, zone);
      counts.set(t.id, row.querySelector(".tag-count"));
    }
    zones.set(UNRANKED, unrankedEl);

    for (const c of cosplays) {
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = c.id;
      const img = document.createElement("img");
      img.src = c.image;
      img.alt = c.name;
      img.draggable = false;
      img.loading = "lazy";
      if (c.position) img.style.objectPosition = c.position;
      card.append(img);
      if (showNames) {
        card.title = c.name;
        const name = document.createElement("span");
        name.className = "card-name";
        name.textContent = c.name;
        card.append(name);
      }
      cards.set(c.id, card);
    }
  }

  function render(state) {
    for (const [key, zone] of zones) zone.replaceChildren(...state[key].map((id) => cards.get(id)));
    updateCounts(state);
  }

  function updateCounts(state) {
    for (const t of tiers) counts.get(t.id).textContent = state[t.id].length || "";
    document.getElementById("rack-count").textContent = `${state[UNRANKED].length} left to rank`;
  }

  function commit() {
    const state = readState();
    if (sharedView) leaveSharedView();
    save(state);
    updateCounts(state);
  }

  function leaveSharedView() {
    sharedView = false;
    bannerEl.hidden = true;
    history.replaceState(null, "", location.pathname + location.search);
  }

  // ---- Drag and drop (mouse, pen, and press-and-hold on touch) ----

  let drag = null;

  function onPointerDown(e) {
    const card = e.target.closest(".card");
    if (!card || e.button > 0) return;
    drag = { card, id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, touch: e.pointerType === "touch" };
    // On touch, a quick swipe scrolls the page; hold briefly to pick a card up.
    if (drag.touch) drag.timer = setTimeout(startDrag, 220);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", endDrag);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.ghost) {
      const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
      if (drag.touch) {
        if (dist > 10) endDrag();
        return;
      }
      if (dist < 5) return;
      startDrag();
    }
    moveGhost();
    placeCard();
  }

  function startDrag() {
    if (!drag || drag.ghost) return;
    const rect = drag.card.getBoundingClientRect();
    drag.offsetX = drag.startX - rect.left;
    drag.offsetY = drag.startY - rect.top;
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.classList.add("ghost");
    drag.ghost.style.width = `${rect.width}px`;
    drag.ghost.style.height = `${rect.height}px`;
    document.body.append(drag.ghost);
    drag.card.classList.add("is-placeholder");
    document.body.classList.add("is-dragging");
    moveGhost();
    autoScroll();
  }

  function moveGhost() {
    drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`;
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
    zone.insertBefore(card, before);
  }

  function autoScroll() {
    if (!drag?.ghost) return;
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
    const dropped = !!drag.ghost;
    endDrag();
    if (dropped) commit();
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

  // Stop the page scrolling under a card being dragged on touch screens,
  // and the long-press menu from opening on a card.
  document.addEventListener("touchmove", (e) => drag?.ghost && e.preventDefault(), { passive: false });
  document.addEventListener("contextmenu", (e) => e.target.closest(".card") && e.preventDefault());

  // ---- Buttons ----

  shareBtn.addEventListener("click", async () => {
    const url = `${location.href.split("#")[0]}#r=${encodeShare(readState())}`;
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "Link copied";
      setTimeout(() => (shareBtn.textContent = "Copy share link"), 2000);
    } catch {
      window.prompt("Copy this link to share your ranking:", url);
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Move every cosplay back to Unranked?")) return;
    if (sharedView) leaveSharedView();
    const state = normalize(null);
    save(state);
    render(state);
  });

  document.getElementById("keep-shared").addEventListener("click", () => {
    leaveSharedView();
    save(readState());
  });

  document.getElementById("leave-shared").addEventListener("click", () => {
    leaveSharedView();
    render(loadSaved());
  });

  // ---- Start ----

  buildBoard();
  document.getElementById("board").addEventListener("pointerdown", onPointerDown);

  const shared = location.hash.startsWith("#r=") ? decodeShare(location.hash.slice(3)) : null;
  if (shared) {
    sharedView = true;
    bannerEl.hidden = false;
    render(shared);
  } else {
    render(loadSaved());
  }
})();
