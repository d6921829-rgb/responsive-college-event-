"use strict";

const EVENTS_KEY = "campus_events_v1";
const REGS_KEY = "campus_regs_v1";

const defaultEvents = [
  { id: 1, title: "CodeSprint Hackathon", category: "Technical", date: "2026-11-14", time: "09:00",
    venue: "Main Auditorium", seats: 120, description: "24-hour hackathon. Build, pitch and win prizes with your team." },
  { id: 2, title: "Annual Cultural Fest", category: "Cultural", date: "2026-11-21", time: "17:00",
    venue: "Open Air Theatre", seats: 500, description: "Dance, music, drama and food stalls. Bring your friends!" },
  { id: 3, title: "Inter-Department Cricket", category: "Sports", date: "2026-11-08", time: "08:30",
    venue: "College Ground", seats: 60, description: "Knockout cricket tournament between all departments." },
  { id: 4, title: "Web Development Workshop", category: "Workshop", date: "2026-10-28", time: "10:00",
    venue: "Computer Lab 2", seats: 40, description: "Hands-on HTML, CSS and JavaScript workshop for beginners." },
  { id: 5, title: "Careers in AI Seminar", category: "Seminar", date: "2026-12-02", time: "11:00",
    venue: "Seminar Hall A", seats: 200, description: "Industry experts talk about careers, skills and projects in AI." },
];

/* ---------- State ---------- */
let events = load(EVENTS_KEY, defaultEvents);
let regs = load(REGS_KEY, []); // { id, eventId, name, roll, email, dept, at }
let activeEventId = null;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save() {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    localStorage.setItem(REGS_KEY, JSON.stringify(regs));
  } catch { /* storage may be blocked; app still works in memory */ }
}

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node; // text goes through append(), so user input is never parsed as HTML
}

function seatsLeft(ev) {
  return ev.seats - regs.filter((r) => r.eventId === ev.id).length;
}

function eventDateTime(ev) {
  return new Date(`${ev.date}T${ev.time || "00:00"}`);
}

function isPast(ev) {
  return eventDateTime(ev) < new Date();
}

function fmtDate(ev) {
  return eventDateTime(ev).toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- Rendering ---------- */
function renderCategories() {
  const sel = $("categoryFilter");
  const current = sel.value || "all";
  const cats = [...new Set(events.map((e) => e.category))].sort();
  sel.replaceChildren(el("option", { value: "all", textContent: "All categories" }));
  cats.forEach((c) => sel.append(el("option", { value: c, textContent: c })));
  sel.value = cats.includes(current) ? current : "all";
}

function renderEvents() {
  const q = $("search").value.trim().toLowerCase();
  const cat = $("categoryFilter").value;
  const sort = $("sortBy").value;

  let list = events.filter((e) =>
    (cat === "all" || e.category === cat) &&
    (!q || `${e.title} ${e.venue} ${e.description}`.toLowerCase().includes(q))
  );

  list.sort((a, b) => {
    if (sort === "seats") return seatsLeft(b) - seatsLeft(a);
    if (sort === "title") return a.title.localeCompare(b.title);
    return eventDateTime(a) - eventDateTime(b);
  });

  const grid = $("eventGrid");
  grid.replaceChildren();
  $("emptyMsg").hidden = list.length > 0;

  list.forEach((ev) => {
    const left = seatsLeft(ev);
    const pct = Math.max(0, Math.min(100, ((ev.seats - left) / ev.seats) * 100));
    const already = regs.some((r) => r.eventId === ev.id);
    const past = isPast(ev);

    let label = "Register";
    if (past) label = "Event ended";
    else if (already) label = "Registered ✓";
    else if (left <= 0) label = "Sold out";

    const btn = el("button", {
      class: "btn btn-primary",
      type: "button",
      textContent: label,
      disabled: past || already || left <= 0,
      onclick: () => openModal(ev.id),
    });

    const barClass = left <= 0 ? "seats-bar full" : pct > 80 ? "seats-bar low" : "seats-bar";

    grid.append(
      el("article", { class: "event-card" },
        el("span", { class: "tag", textContent: ev.category }),
        el("h3", { textContent: ev.title }),
        el("p", { textContent: ev.description }),
        el("div", { class: "meta" },
          el("span", { textContent: "📅 " + fmtDate(ev) }),
          el("span", { textContent: "📍 " + ev.venue })
        ),
        el("div", { class: barClass }, el("span", { style: `width:${pct}%` })),
        el("div", { class: "seats-text", textContent: `${Math.max(left, 0)} of ${ev.seats} seats left` }),
        btn
      )
    );
  });
}

function renderRegistrations() {
  const box = $("regList");
  box.replaceChildren();

  if (!regs.length) {
    box.append(el("p", { class: "empty", textContent: "You haven't registered for any events yet." }));
    return;
  }

  regs.forEach((r) => {
    const ev = events.find((e) => e.id === r.eventId);
    if (!ev) return;
    box.append(
      el("div", { class: "reg-item" },
        el("div", {},
          el("strong", { textContent: ev.title }),
          el("small", { textContent: `${r.name} · ${r.roll} · ${r.dept} · ${fmtDate(ev)}` })
        ),
        el("button", {
          class: "btn btn-outline", type: "button", textContent: "Cancel",
          onclick: () => cancelRegistration(r.id),
        })
      )
    );
  });
}

function renderStats() {
  $("statEvents").textContent = events.filter((e) => !isPast(e)).length;
  $("statSeats").textContent = events
    .filter((e) => !isPast(e))
    .reduce((sum, e) => sum + Math.max(seatsLeft(e), 0), 0);
  $("statMine").textContent = regs.length;
}

function renderAll() {
  renderCategories();
  renderEvents();
  renderRegistrations();
  renderStats();
}

/* ---------- Registration modal ---------- */
function openModal(eventId) {
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return;
  activeEventId = eventId;
  $("modalTitle").textContent = "Register: " + ev.title;
  $("modalSub").textContent = `${fmtDate(ev)} · ${ev.venue}`;
  $("regForm").reset();
  setMsg("regMsg", "");
  $("modal").hidden = false;
  $("regForm").elements.name.focus();
}

function closeModal() {
  $("modal").hidden = true;
  activeEventId = null;
}

function setMsg(id, text, type = "") {
  const m = $(id);
  m.textContent = text;
  m.className = "form-msg full " + type;
  if (id === "regMsg") m.className = "form-msg " + type;
}

$("regForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const name = f.name.value.trim();
  const roll = f.roll.value.trim().toUpperCase();
  const email = f.email.value.trim().toLowerCase();
  const dept = f.dept.value;

  if (!name || !roll || !email || !dept) return setMsg("regMsg", "Please fill in all fields.", "error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg("regMsg", "Enter a valid email address.", "error");

  const ev = events.find((x) => x.id === activeEventId);
  if (!ev) return;
  if (isPast(ev)) return setMsg("regMsg", "This event has already ended.", "error");
  if (seatsLeft(ev) <= 0) return setMsg("regMsg", "Sorry, this event is full.", "error");
  if (regs.some((r) => r.eventId === ev.id && (r.roll === roll || r.email === email))) {
    return setMsg("regMsg", "This roll number or email is already registered.", "error");
  }

  regs.push({ id: Date.now(), eventId: ev.id, name, roll, email, dept, at: new Date().toISOString() });
  save();
  closeModal();
  renderAll();
  toast("Registered for " + ev.title + " 🎉");
});

function cancelRegistration(regId) {
  if (!confirm("Cancel this registration?")) return;
  regs = regs.filter((r) => r.id !== regId);
  save();
  renderAll();
  toast("Registration cancelled");
}

/* ---------- Add event ---------- */
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const ev = {
    id: Date.now(),
    title: f.title.value.trim(),
    category: f.category.value,
    date: f.date.value,
    time: f.time.value,
    venue: f.venue.value.trim(),
    seats: parseInt(f.seats.value, 10),
    description: f.description.value.trim(),
  };

  if (!ev.title || !ev.date || !ev.time || !ev.venue || !ev.description || !(ev.seats > 0)) {
    return setMsg("addMsg", "Please fill in all fields correctly.", "error");
  }
  if (isPast(ev)) return setMsg("addMsg", "Event date and time must be in the future.", "error");

  events.push(ev);
  save();
  e.target.reset();
  setMsg("addMsg", "Event added!", "ok");
  renderAll();
  toast("Event added");
});

/* ---------- UI wiring ---------- */
["input", "change"].forEach((evt) => {
  $("search").addEventListener(evt, renderEvents);
  $("categoryFilter").addEventListener(evt, renderEvents);
  $("sortBy").addEventListener(evt, renderEvents);
});

$("modalClose").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });

$("menuBtn").addEventListener("click", () => {
  const open = $("nav").classList.toggle("open");
  $("menuBtn").setAttribute("aria-expanded", String(open));
});
$("nav").addEventListener("click", (e) => {
  if (e.target.tagName === "A") {
    $("nav").classList.remove("open");
    $("menuBtn").setAttribute("aria-expanded", "false");
  }
});

// Prevent picking past dates in the add-event form
$("addForm").elements.date.min = new Date().toISOString().split("T")[0];
$("year").textContent = new Date().getFullYear();

renderAll();