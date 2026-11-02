const contextLabels = { home: "Leaving home", gym: "Gym bag", errands: "Errands" };
const kindLabels = { carry: "Take with you", stop: "At a stop", remember: "Remember" };
const storageKey = "latch-list-items-v1";
const seeds = [
  { id: "seed-home-keys", title: "Keys", context: "home", kind: "carry", place: "", done: false },
  { id: "seed-home-wallet", title: "Wallet", context: "home", kind: "carry", place: "", done: false },
  { id: "seed-home-water", title: "Water bottle", context: "home", kind: "carry", place: "", done: false },
  { id: "seed-errands-book", title: "Return the library book", context: "errands", kind: "stop", place: "Library", done: false },
  { id: "seed-errands-bags", title: "Reusable bags", context: "errands", kind: "carry", place: "", done: false },
  { id: "seed-gym-clothes", title: "Workout clothes", context: "gym", kind: "carry", place: "", done: false },
  { id: "seed-gym-bottle", title: "Fill the bottle", context: "gym", kind: "remember", place: "", done: false },
];
const state = { context: "home", items: [], toastTimer: null };
const els = {
  items: document.getElementById("items"),
  tabs: [...document.querySelectorAll(".context-tab")],
  form: document.getElementById("addForm"),
  title: document.getElementById("itemTitle"),
  kind: document.getElementById("itemKind"),
  place: document.getElementById("itemPlace"),
  progressTitle: document.getElementById("progressTitle"),
  progressText: document.getElementById("progressText"),
  progressCount: document.getElementById("progressCount"),
  progressBar: document.getElementById("progressBar"),
  listTitle: document.getElementById("listTitle"),
  toast: document.getElementById("toast"),
};

function readItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(saved)) return saved;
  } catch (_error) { /* Restore starter lists if browser storage is unavailable or invalid. */ }
  return seeds.map(item => ({ ...item }));
}

function saveItems() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.items));
    return true;
  } catch (_error) {
    toast("Browser storage is unavailable. Your changes may not be saved.");
    return false;
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function makeEmpty() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const headline = document.createElement("strong");
  headline.textContent = "Nothing on this list yet.";
  const detail = document.createElement("span");
  detail.textContent = "Add one small reminder below and let this list hold onto it.";
  empty.append(headline, detail);
  return empty;
}

function makeItem(item) {
  const article = document.createElement("article");
  article.className = `item${item.done ? " done" : ""} kind-${item.kind}`;

  const check = document.createElement("button");
  check.className = "check-button";
  check.type = "button";
  check.setAttribute("aria-label", item.done ? `Mark ${item.title} not ready` : `Mark ${item.title} ready`);
  check.setAttribute("aria-pressed", String(item.done));
  const checkIcon = document.createElement("span");
  checkIcon.textContent = item.done ? "✓" : "";
  check.append(checkIcon);
  check.addEventListener("click", () => setDone(item));

  const body = document.createElement("div");
  body.className = "item-body";
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = item.title;
  const meta = document.createElement("span");
  meta.className = "item-meta";
  const dot = document.createElement("i");
  dot.className = "kind-dot";
  const kind = document.createElement("span");
  kind.textContent = kindLabels[item.kind] || "Reminder";
  meta.append(dot, kind);
  if (item.place) {
    const place = document.createElement("span");
    place.className = "place-label";
    place.textContent = `· ${item.place}`;
    meta.append(place);
  }
  body.append(title, meta);

  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${item.title}`);
  remove.textContent = "×";
  remove.addEventListener("click", () => removeItem(item));
  article.append(check, body, remove);
  return article;
}

function render() {
  els.items.replaceChildren();
  const visible = state.items.filter(item => item.context === state.context);
  if (visible.length === 0) els.items.append(makeEmpty());
  else visible.forEach(item => els.items.append(makeItem(item)));

  const total = visible.length;
  const done = visible.filter(item => item.done).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  els.progressCount.textContent = `${done}/${total}`;
  els.progressBar.style.width = `${percent}%`;
  els.progressTitle.textContent = percent === 100 && total > 0 ? "You’re all set." : `Your ${contextLabels[state.context].toLowerCase()} check`;
  els.progressText.textContent = total === 0
    ? "Add the one thing you’re most likely to forget."
    : percent === 100 ? "Everything on this list is ready to go." : "A short check now can save a trip back later.";
  els.listTitle.textContent = state.context === "home" ? "Take it with you" : state.context === "gym" ? "Get out the door" : "On the way";
  els.items.setAttribute("aria-busy", "false");
}

function loadItems() {
  state.items = readItems();
  render();
}

function setDone(item) {
  state.items = state.items.map(entry => entry.id === item.id ? { ...entry, done: !entry.done } : entry);
  saveItems();
  loadItems();
  toast(item.done ? "Back on the list." : "One less thing to carry in your head.");
}

function removeItem(item) {
  state.items = state.items.filter(entry => entry.id !== item.id);
  saveItems();
  render();
  toast("Reminder removed.");
}

els.tabs.forEach(tab => tab.addEventListener("click", () => {
  state.context = tab.dataset.context;
  els.tabs.forEach(button => {
    const selected = button === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  els.form.reset();
  updatePlaceField();
  loadItems();
}));

function updatePlaceField() {
  const showPlace = els.kind.value === "stop";
  els.place.hidden = !showPlace;
  els.place.required = showPlace;
  els.place.placeholder = state.context === "errands" ? "e.g. Library" : "e.g. Pharmacy";
}
els.kind.addEventListener("change", updatePlaceField);

els.form.addEventListener("submit", event => {
  event.preventDefault();
  const button = els.form.querySelector(".add-button");
  button.disabled = true;
  const title = els.title.value.trim();
  const kind = els.kind.value;
  const place = els.place.value.trim();
  if (!title || title.length > 90 || (kind === "stop" && !place) || place.length > 50) {
    toast("Check the reminder details and try again.");
    button.disabled = false;
    return;
  }
  state.items.push({
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title, context: state.context, kind, place: kind === "stop" ? place : "", done: false,
  });
  saveItems();
  els.form.reset();
  updatePlaceField();
  loadItems();
  toast("Tucked safely onto your list.");
  button.disabled = false;
  els.title.focus();
});

document.getElementById("resetDone").addEventListener("click", () => {
  const completed = state.items.filter(item => item.context === state.context && item.done);
  if (!completed.length) { toast("No completed reminders to clear."); return; }
  const completedIds = new Set(completed.map(item => item.id));
  state.items = state.items.filter(item => !completedIds.has(item.id));
  saveItems();
  loadItems();
  toast(`Cleared ${completed.length} completed reminder${completed.length === 1 ? "" : "s"}.`);
});

document.getElementById("todayText").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric",
}).format(new Date()) + " — take your time at the door.";

updatePlaceField();
loadItems();
