const contextLabels = { home: "Leaving home", gym: "Gym bag", errands: "Errands" };
const kindLabels = { carry: "Take with you", stop: "At a stop", remember: "Remember" };
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

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong. Try again.");
  return result;
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
  if (state.items.length === 0) els.items.append(makeEmpty());
  else state.items.forEach(item => els.items.append(makeItem(item)));

  const total = state.items.length;
  const done = state.items.filter(item => item.done).length;
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

async function loadItems() {
  els.items.setAttribute("aria-busy", "true");
  try {
    state.items = await request(`/api/items?context=${encodeURIComponent(state.context)}`);
    render();
  } catch (error) {
    els.items.replaceChildren();
    const message = makeEmpty();
    message.querySelector("strong").textContent = "Couldn’t load your checklist.";
    message.querySelector("span").textContent = error.message;
    els.items.append(message);
    els.items.setAttribute("aria-busy", "false");
  }
}

async function setDone(item) {
  try {
    await request(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ done: !item.done }) });
    await loadItems();
    toast(item.done ? "Back on the list." : "One less thing to carry in your head.");
  } catch (error) { toast(error.message); }
}

async function removeItem(item) {
  try {
    await request(`/api/items/${item.id}`, { method: "DELETE" });
    state.items = state.items.filter(entry => entry.id !== item.id);
    render();
    toast("Reminder removed.");
  } catch (error) { toast(error.message); }
}

els.tabs.forEach(tab => tab.addEventListener("click", async () => {
  state.context = tab.dataset.context;
  els.tabs.forEach(button => {
    const selected = button === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  els.form.reset();
  updatePlaceField();
  await loadItems();
}));

function updatePlaceField() {
  const showPlace = els.kind.value === "stop";
  els.place.hidden = !showPlace;
  els.place.required = showPlace;
  els.place.placeholder = state.context === "errands" ? "e.g. Library" : "e.g. Pharmacy";
}
els.kind.addEventListener("change", updatePlaceField);

els.form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = els.form.querySelector(".add-button");
  button.disabled = true;
  try {
    await request("/api/items", {
      method: "POST",
      body: JSON.stringify({
        title: els.title.value.trim(), context: state.context,
        kind: els.kind.value, place: els.place.value.trim(),
      }),
    });
    els.form.reset();
    updatePlaceField();
    await loadItems();
    toast("Tucked safely onto your list.");
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; els.title.focus(); }
});

document.getElementById("resetDone").addEventListener("click", async () => {
  const completed = state.items.filter(item => item.done);
  if (!completed.length) { toast("No completed reminders to clear."); return; }
  try {
    await Promise.all(completed.map(item => request(`/api/items/${item.id}`, { method: "DELETE" })));
    await loadItems();
    toast(`Cleared ${completed.length} completed reminder${completed.length === 1 ? "" : "s"}.`);
  } catch (error) { toast(error.message); }
});

document.getElementById("todayText").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric",
}).format(new Date()) + " — take your time at the door.";

updatePlaceField();
loadItems();
