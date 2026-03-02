const { useEffect, useRef, useState } = React;

const STORAGE_KEY = "freshclock_data";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WARN_WINDOW_MS = 12 * HOUR_MS;

const ZONE_ORDER = ["Fridge", "Freezer"];

const CATEGORY_ORDER = ["Meat", "Seafood", "Dairy", "Produce", "Bakery", "Eggs", "Other"];

const CATEGORY_LABEL = {
  Meat: "肉类",
  Seafood: "海鲜",
  Dairy: "奶制品",
  Produce: "蔬果",
  Bakery: "面食/烘焙",
  Eggs: "蛋类",
  Other: "其他"
};

const CATEGORY_EMOJI = {
  Meat: "🥩",
  Seafood: "🐟",
  Dairy: "🥛",
  Produce: "🥬",
  Bakery: "🥖",
  Eggs: "🥚",
  Other: "🥣"
};

const CATEGORY_DEFAULT_DAYS = {
  Fridge: {
    Meat: 3,
    Seafood: 2,
    Dairy: 7,
    Produce: 5,
    Bakery: 4,
    Eggs: 14,
    Other: 7
  },
  Freezer: {
    Meat: 90,
    Seafood: 90,
    Dairy: 90,
    Produce: 90,
    Bakery: 90,
    Eggs: 90,
    Other: 90
  }
};

const FREEZER_EXTRA_DAYS = 90;

const DEFAULT_ITEMS = [
  { id: 1, name: "Salmon Fillet", zone: "Fridge", category: "Seafood", addedDate: "2026-03-02", expiryDate: "2026-03-07" },
  { id: 2, name: "Frozen Dumplings", zone: "Freezer", category: "Bakery", addedDate: "2026-03-02", expiryDate: "2026-05-31" }
];

function nowMs() {
  return Date.now();
}

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODateToMs(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function endOfDayMs(dateIso) {
  const start = parseISODateToMs(dateIso);
  if (start == null) return null;
  return start + DAY_MS - 1;
}

function addDaysToISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return toISODate(d);
}

function defaultExpiryDateFor(zone, category) {
  const z = zone === "Freezer" ? "Freezer" : "Fridge";
  const c = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, category) ? category : "Other";
  const baseDays = CATEGORY_DEFAULT_DAYS.Fridge?.[c] ?? CATEGORY_DEFAULT_DAYS.Fridge.Other;
  const days = z === "Freezer" ? FREEZER_EXTRA_DAYS : baseDays;
  return addDaysToISO(days);
}

function todayISO() {
  return toISODate(new Date());
}

function expiryAtMs(item) {
  if (!item?.expiryDate) return null;
  return endOfDayMs(item.expiryDate);
}

function remainingMs(item, tMs) {
  const expiryAt = expiryAtMs(item);
  if (expiryAt == null) return null;
  return expiryAt - tMs;
}

function urgencyBucket(rem) {
  if (rem == null) return 3;
  if (rem <= 0) return 0;
  if (rem < WARN_WINDOW_MS) return 1;
  return 2;
}

function urgencyValue(rem) {
  if (rem == null) return Number.POSITIVE_INFINITY;
  if (rem <= 0) return -rem;
  return rem;
}

function compareItemsByUrgency(a, b, tMs) {
  const ar = remainingMs(a, tMs);
  const br = remainingMs(b, tMs);

  const aBucket = urgencyBucket(ar);
  const bBucket = urgencyBucket(br);
  if (aBucket !== bBucket) return aBucket - bBucket;

  const aVal = urgencyValue(ar);
  const bVal = urgencyValue(br);
  if (aVal !== bVal) return aVal - bVal;

  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
}

function cleanVoiceText(s) {
  return String(s || "")
    .trim()
    .replace(/[。．\.！!]+$/g, "")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

function formatRemaining(item, tMs) {
  const rem = remainingMs(item, tMs);
  if (rem == null) return { text: "—", className: "" };
  if (rem <= 0) return { text: "⚠️ 已过期", className: "text-red-900 font-bold" };
  if (rem < WARN_WINDOW_MS) {
    const hours = Math.max(1, Math.ceil(rem / HOUR_MS));
    return { text: `剩余 ${hours} 小时`, className: "text-red-800 font-bold" };
  }
  const days = Math.max(1, Math.ceil(rem / DAY_MS));
  return { text: `剩余 ${days} 天`, className: "" };
}

function normalizeItem(x) {
  const id = x?.id ?? nowMs() + Math.floor(Math.random() * 10000);
  const name = String(x?.name ?? "").trim() || "Fresh Food";

  const rawZone = String(x?.zone ?? "").trim();
  const zone = rawZone === "Fridge" || rawZone === "Freezer" ? rawZone : "Fridge";

  const rawCategory = String(x?.category ?? "").trim();
  const category = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, rawCategory) ? rawCategory : "Other";

  const addedDateRaw = String(x?.addedDate ?? "").trim();
  const addedDate = parseISODateToMs(addedDateRaw) != null ? addedDateRaw : todayISO();

  const expiryDateRaw = x?.expiryDate != null ? String(x?.expiryDate).trim() : "";
  const expiryDateValid = expiryDateRaw && parseISODateToMs(expiryDateRaw) != null;
  let expiryDate = expiryDateValid ? expiryDateRaw : "";
  if (!expiryDate) {
    const addedMs = parseISODateToMs(addedDate);
    const legacyDays = Number(x?.expiryDays ?? 0);
    if (addedMs != null && Number.isFinite(legacyDays) && legacyDays > 0) {
      const d = new Date(addedMs + (Math.max(1, Math.floor(legacyDays)) - 1) * DAY_MS);
      expiryDate = toISODate(d);
    } else {
      expiryDate = defaultExpiryDateFor(zone, category);
    }
  }

  return {
    id,
    name,
    zone,
    category,
    addedDate,
    expiryDate
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed.map(normalizeItem).filter(Boolean);
    return cleaned.length ? cleaned : [];
  } catch {
    return null;
  }
}

function saveData(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return React.createElement(
    "div",
    { className: "fixed inset-0 z-50 flex items-end justify-center sm:items-center" },
    React.createElement("div", {
      className: "absolute inset-0 bg-black/30",
      role: "button",
      tabIndex: 0,
      onClick: onClose,
      onKeyDown: (e) => (e.key === "Enter" || e.key === " " ? onClose() : null)
    }),
    React.createElement(
      "div",
      {
        className:
          "relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-black/10 p-4 pb-5"
      },
      React.createElement(
        "div",
        { className: "flex items-start justify-between gap-3" },
        React.createElement("div", { className: "min-w-0" }, React.createElement("div", { className: "text-lg font-semibold" }, title)),
        React.createElement(
          "button",
          {
            type: "button",
            className: "shrink-0 w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 active:bg-black/15",
            onClick: onClose,
            "aria-label": "Close"
          },
          "×"
        )
      ),
      React.createElement("div", { className: "mt-3" }, children)
    )
  );
}

function ConfirmDialog({ open, title, message, confirmText, cancelText, onConfirm, onCancel }) {
  if (!open) return null;
  return React.createElement(
    "div",
    { className: "fixed inset-0 z-50 flex items-end justify-center sm:items-center" },
    React.createElement("div", { className: "absolute inset-0 bg-black/30" }),
    React.createElement(
      "div",
      { className: "relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-black/10 p-4 pb-5" },
      React.createElement("div", { className: "text-lg font-semibold" }, title || "确认"),
      React.createElement("div", { className: "mt-2 text-sm text-slate-700" }, message),
      React.createElement(
        "div",
        { className: "mt-4 space-y-2" },
        React.createElement(
          "button",
          { type: "button", className: "w-full px-4 py-3 rounded-xl bg-black/5 active:bg-black/10", onClick: onCancel },
          cancelText || "取消"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "w-full px-4 py-3 rounded-xl text-white shadow-md active:shadow-sm",
            style: { backgroundColor: "#2d5a27", color: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
            onClick: onConfirm
          },
          confirmText || "确定"
        )
      )
    )
  );
}

function TrashIcon() {
  return React.createElement(
    "svg",
    { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" },
    React.createElement("path", {
      d: "M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v9h-2v-9Zm4 0h2v9h-2v-9ZM7 10h2v9H7v-9Zm-1-1h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9Z",
      fill: "currentColor"
    })
  );
}

function EditIcon() {
  return React.createElement(
    "svg",
    { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" },
    React.createElement("path", {
      d: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.96-8.96.92.92-8.96 8.96ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.82 1.82 3.75 3.75 1.82-1.82Z",
      fill: "currentColor"
    })
  );
}

function App() {
  const [items, setItems] = useState([]);
  const [tick, setTick] = useState(nowMs());

  const [expandedGroups, setExpandedGroups] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addZone, setAddZone] = useState("Fridge");
  const [addCategory, setAddCategory] = useState("Produce");
  const [addName, setAddName] = useState("");
  const [addExpiryDate, setAddExpiryDate] = useState("");
  const [addError, setAddError] = useState("");
  const [addDateTouched, setAddDateTouched] = useState(false);
  const addNameRef = useRef(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editZone, setEditZone] = useState("Fridge");
  const [editCategory, setEditCategory] = useState("Produce");
  const [editName, setEditName] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editError, setEditError] = useState("");
  const [editDateTouched, setEditDateTouched] = useState(false);
  const editNameRef = useRef(null);

  const speechRef = useRef(null);
  const speechBaseRef = useRef("");
  const speechFinalRef = useRef("");
  const voiceTimeoutRef = useRef(null);
  const isListeningRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const speechSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const addSubmitLockRef = useRef(0);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const editSubmitLockRef = useRef(0);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [lastAddedId, setLastAddedId] = useState(null);

  const setAndSave = (updater) => {
    setItems((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  };

  useEffect(() => {
    const loaded = loadData();
    if (loaded != null) {
      setItems(loaded.length ? loaded : DEFAULT_ITEMS);
      if (!loaded.length) saveData(DEFAULT_ITEMS);
      return;
    }
    setItems(DEFAULT_ITEMS);
    saveData(DEFAULT_ITEMS);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(nowMs()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const toggleGroupExpanded = (zone, category) => {
    const key = `${zone}:${category}`;
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev?.[key] }));
  };

  const resetAddForm = (zone = "Fridge") => {
    const z = zone === "Freezer" ? "Freezer" : "Fridge";
    const c = "Produce";
    setAddZone(z);
    setAddCategory(c);
    setAddName("");
    setAddDateTouched(false);
    setAddExpiryDate(defaultExpiryDateFor(z, c));
    setAddError("");
  };

  const clearVoiceTimeout = () => {
    const id = voiceTimeoutRef.current;
    if (id) clearTimeout(id);
    voiceTimeoutRef.current = null;
  };

  const stopSpeech = () => {
    clearVoiceTimeout();
    try { speechRef.current?.stop?.(); } catch {}
    isListeningRef.current = false;
    setIsListening(false);
  };

  const closeAdd = () => {
    setAddOpen(false);
    resetAddForm("Fridge");
    isListeningRef.current = false;
    setIsListening(false);
    try { speechRef.current?.stop?.(); } catch {}
    clearVoiceTimeout();
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditId(null);
    setEditZone("Fridge");
    setEditCategory("Produce");
    setEditName("");
    setEditExpiryDate("");
    setEditError("");
    setEditDateTouched(false);
    isListeningRef.current = false;
    setIsListening(false);
    try { speechRef.current?.stop?.(); } catch {}
    clearVoiceTimeout();
  };

  const openAdd = () => {
    resetAddForm("Fridge");
    setAddOpen(true);
    setTimeout(() => addNameRef.current?.focus?.(), 0);
  };

  const openEdit = (item) => {
    if (!item) return;
    const zone = item.zone === "Freezer" ? "Freezer" : "Fridge";
    const category = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, item?.category) ? item.category : "Other";
    setEditId(item.id);
    setEditZone(zone);
    setEditCategory(category);
    setEditName(String(item.name || "").trim());
    setEditDateTouched(false);
    setEditExpiryDate(String(item.expiryDate || "").trim() || defaultExpiryDateFor(zone, category));
    setEditError("");
    setEditOpen(true);
    setTimeout(() => editNameRef.current?.focus?.(), 0);
  };

  const onAddZoneChange = (next) => {
    const z = next === "Freezer" ? "Freezer" : "Fridge";
    setAddZone(z);
    setAddDateTouched(false);
    setAddExpiryDate(defaultExpiryDateFor(z, addCategory));
    setAddError("");
  };

  const onAddCategoryChange = (next) => {
    const c = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, next) ? next : "Other";
    setAddCategory(c);
    setAddDateTouched(false);
    setAddExpiryDate(defaultExpiryDateFor(addZone, c));
    setAddError("");
  };

  const onAddExpiryDateChange = (next) => {
    setAddDateTouched(true);
    setAddExpiryDate(next);
    setAddError("");
  };

  const onAddConfirm = () => {
    const zone = addZone === "Freezer" ? "Freezer" : "Fridge";
    const category = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, addCategory) ? addCategory : "Other";
    if (isListeningRef.current) stopSpeech();
    const t = nowMs();
    if (t - addSubmitLockRef.current < 500) return;
    addSubmitLockRef.current = t;
    setAddSubmitting(true);
    setTimeout(() => setAddSubmitting(false), 600);

    let name = addName.trim();
    if (!name) name = `${zone}-${CATEGORY_LABEL[category] || category}-新食材`;

    let expiryDate = String(addExpiryDate || "").trim() || defaultExpiryDateFor(zone, category);
    const minDate = todayISO();
    if (expiryDate && expiryDate < minDate) expiryDate = minDate;
    if (parseISODateToMs(expiryDate) == null) expiryDate = defaultExpiryDateFor(zone, category);

    const addedDate = todayISO();
    const nextItem = {
      id: nowMs() + Math.floor(Math.random() * 10000),
      name,
      zone,
      category,
      addedDate,
      expiryDate
    };

    setAndSave((prev) => [nextItem, ...prev]);
    setLastAddedId(nextItem.id);
    closeAdd();
  };

  const onEditZoneChange = (next) => {
    const z = next === "Freezer" ? "Freezer" : "Fridge";
    setEditZone(z);
    setEditDateTouched(false);
    setEditExpiryDate(defaultExpiryDateFor(z, editCategory));
    setEditError("");
  };

  const onEditCategoryChange = (next) => {
    const c = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, next) ? next : "Other";
    setEditCategory(c);
    setEditDateTouched(false);
    setEditExpiryDate(defaultExpiryDateFor(editZone, c));
    setEditError("");
  };

  const onEditExpiryDateChange = (next) => {
    setEditDateTouched(true);
    setEditExpiryDate(next);
    setEditError("");
  };

  const onEditConfirm = () => {
    const id = editId;
    if (id == null) return;
    if (isListeningRef.current) stopSpeech();
    const t = nowMs();
    if (t - editSubmitLockRef.current < 500) return;
    editSubmitLockRef.current = t;
    setEditSubmitting(true);
    setTimeout(() => setEditSubmitting(false), 600);
    const zone = editZone === "Freezer" ? "Freezer" : "Fridge";
    const category = Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, editCategory) ? editCategory : "Other";
    const name = editName.trim();
    if (!name) {
      setEditError("食物名称不能为空");
      setTimeout(() => editNameRef.current?.focus?.(), 0);
      return;
    }

    let expiryDate = String(editExpiryDate || "").trim() || defaultExpiryDateFor(zone, category);
    if (parseISODateToMs(expiryDate) == null) expiryDate = defaultExpiryDateFor(zone, category);

    setAndSave((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              name,
              zone,
              category,
              expiryDate
            }
          : x
      )
    );
    closeEdit();
  };

  const toggleSpeech = () => {
    if (!speechSupported) return;

    if (isListening) {
      try { speechRef.current?.stop?.(); } catch {}
      clearVoiceTimeout();
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    try { speechRef.current?.stop?.(); } catch {}
    clearVoiceTimeout();
    const recognition = new Ctor();
    speechRef.current = recognition;
    speechBaseRef.current = String(editOpen ? editName : addName || "").trim();
    speechFinalRef.current = "";
    if (editOpen) setEditError("");
    else setAddError("");
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalText = speechFinalRef.current;
      let interimText = "";

      const results = event?.results;
      const startIndex = Number(event?.resultIndex ?? 0);

      if (results && typeof results.length === "number") {
        for (let i = startIndex; i < results.length; i += 1) {
          const res = results[i];
          const transcript = res?.[0]?.transcript ?? "";
          if (!String(transcript).trim()) continue;
          if (res?.isFinal) finalText += transcript;
          else interimText += transcript;
        }
      }

      speechFinalRef.current = finalText;
      const base = speechBaseRef.current;
      const merged = cleanVoiceText(`${base}${base ? " " : ""}${finalText}${interimText}`);
      if (merged) {
        if (editOpen) setEditName(merged);
        else setAddName(merged);
      }
      setTimeout(() => (editOpen ? editNameRef.current?.focus?.() : addNameRef.current?.focus?.()), 0);
    };
    recognition.onerror = (event) => {
      clearVoiceTimeout();
      const err = String(event?.error || "");
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture" || err === "no-speech") {
        if (editOpen) setEditError("请检查麦克风权限");
        else setAddError("请检查麦克风权限");
      }
      isListeningRef.current = false;
      setIsListening(false);
    };
    recognition.onend = () => {
      clearVoiceTimeout();
      const base = speechBaseRef.current;
      const finalText = String(speechFinalRef.current || "").trim();
      const merged = cleanVoiceText(`${base}${base ? " " : ""}${finalText}`);
      if (merged) {
        if (editOpen) setEditName(merged);
        else setAddName(merged);
      }
      isListeningRef.current = false;
      setIsListening(false);
    };

    try {
      recognition.start();
      voiceTimeoutRef.current = setTimeout(() => {
        if (!isListeningRef.current) return;
        try { speechRef.current?.stop?.(); } catch {}
        if (editOpen) setEditError("请检查麦克风权限");
        else setAddError("请检查麦克风权限");
        isListeningRef.current = false;
        setIsListening(false);
        voiceTimeoutRef.current = null;
      }, 12000);
    } catch {
      isListeningRef.current = false;
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (!lastAddedId) return;
    const el = document.querySelector(`[data-item-id="${lastAddedId}"]`);
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setLastAddedId(null);
  }, [items, lastAddedId]);

  const deleteItem = (id) => {
    setAndSave((prev) => prev.filter((x) => x.id !== id));
  };

  const requestDelete = (id) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setPendingDeleteId(null);
  };

  const confirmDelete = () => {
    if (pendingDeleteId != null) deleteItem(pendingDeleteId);
    cancelDelete();
  };

  return React.createElement(
    "div",
    { className: "min-h-screen px-4 pt-5 pb-24 flex justify-center" },
    React.createElement(
      "div",
      { className: "w-full max-w-5xl" },
      React.createElement(
        "header",
        { className: "flex items-start justify-between gap-3" },
        React.createElement(
          "div",
          { className: "min-w-0" },
          React.createElement("h1", { className: "text-2xl font-extrabold tracking-tight" }, "FreshClock"),
          React.createElement("p", { className: "text-sm text-slate-600 mt-1" }, "买了别忘吃。"),
          React.createElement(
            "div",
            { className: "mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600" },
            React.createElement(
              "a",
              { href: "./privacy.html", target: "_blank", rel: "noreferrer", className: "px-2 py-1 rounded-lg bg-black/5 active:bg-black/10" },
              "隐私政策"
            ),
            React.createElement(
              "a",
              { href: "./terms.html", target: "_blank", rel: "noreferrer", className: "px-2 py-1 rounded-lg bg-black/5 active:bg-black/10" },
              "服务条款"
            )
          )
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className:
              "relative z-30 w-12 h-12 rounded-2xl bg-[#2d5a27] text-white shadow-md active:bg-[#24481f] text-xl flex items-center justify-center",
            onClick: openAdd,
            "aria-label": "Add"
          },
          "+"
        )
      ),
      React.createElement(
        "main",
        { className: "mt-4" },
        items.length === 0
          ? React.createElement(
              "div",
              { className: "mb-4 rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm" },
              React.createElement("div", { className: "text-base font-semibold text-slate-800" }, "冰箱里空空的，快去超市采购并录入吧！"),
              React.createElement("div", { className: "mt-1 text-sm text-slate-600" }, "点击右上角 +，把食材按区域与品类收纳管理。"),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "mt-4 w-full h-12 rounded-xl text-white shadow-md active:shadow-sm",
                  style: { backgroundColor: "#2d5a27", color: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
                  onClick: openAdd
                },
                "去添加"
              )
            )
          : null,
        React.createElement(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch" },
          ZONE_ORDER.map((zone, zoneIdx) => {
            const zoneItems = items.filter((i) => String(i?.zone ?? "Fridge") === zone);

            return React.createElement(
              "section",
              {
                key: zone,
                className: "h-full rounded-2xl bg-white/70 border border-black/10 shadow-sm p-3 fc-rise"
              },
              React.createElement(
                "div",
                { className: "flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-black/5" },
                React.createElement(
                  "div",
                  { className: "min-w-0 flex items-center gap-2" },
                  React.createElement("span", { className: "text-base shrink-0" }, zone === "Fridge" ? "❄️" : "🧊"),
                  React.createElement("span", { className: "font-semibold text-slate-800 truncate" }, zone),
                  React.createElement(
                    "span",
                    { className: "shrink-0 text-xs px-2 py-1 rounded-full bg-white/80 border border-black/10 text-slate-700" },
                    String(zoneItems.length)
                  )
                )
              ),
              React.createElement(
                "div",
                { className: "mt-3 space-y-4" },
                zoneItems.length === 0
                  ? React.createElement(
                      "div",
                      {
                        className:
                          "rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-8 text-center text-sm text-slate-500"
                      },
                      "这里还没有食材"
                    )
                  : CATEGORY_ORDER.map((category) => {
                      const catItems = zoneItems.filter((i) => String(i?.category ?? "Other") === category);
                      if (!catItems.length) return null;

                      const sorted = [...catItems].sort((a, b) => compareItemsByUrgency(a, b, tick));
                      const groupKey = `${zone}:${category}`;
                      const expanded = Boolean(expandedGroups?.[groupKey]);
                      const visible = expanded ? sorted : sorted.slice(0, 3);
                      const hasMore = sorted.length > 3;

                      return React.createElement(
                        "div",
                        { key: groupKey, className: "space-y-2" },
                        React.createElement(
                          "div",
                          { className: "flex items-center justify-between gap-2 px-1" },
                          React.createElement(
                            "div",
                            { className: "min-w-0 flex items-center gap-2" },
                            React.createElement("span", { className: "text-sm" }, CATEGORY_EMOJI[category] || "🥣"),
                            React.createElement("span", { className: "text-sm font-semibold text-slate-800 truncate" }, CATEGORY_LABEL[category] || category),
                            React.createElement(
                              "span",
                              { className: "shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-black/10 text-slate-600" },
                              String(sorted.length)
                            )
                          )
                        ),
                        React.createElement(
                          "div",
                          { className: "space-y-2" },
                          visible.map((it, itemIdx) => {
                            const rem = remainingMs(it, tick);
                            const expired = rem != null && rem <= 0;
                            const soon = rem != null && rem > 0 && rem < WARN_WINDOW_MS;
                            const warn = expired || soon;
                            const display = formatRemaining(it, tick);

                            const bg = warn ? "bg-red-50/60" : "bg-white";
                            const border = warn ? "border-red-200" : "border-black/10";

                            return React.createElement(
                              "div",
                              {
                                key: it.id,
                                "data-item-id": it.id,
                                className: `rounded-xl border p-3 flex items-start justify-between gap-3 ${bg} ${border}`,
                                style: { animationDelay: `${Math.min((zoneIdx * 9 + itemIdx) * 30, 240)}ms` }
                              },
                              React.createElement(
                                "div",
                                { className: "min-w-0" },
                                React.createElement("div", { className: "font-semibold truncate" }, it.name),
                                React.createElement("div", { className: `mt-1 text-sm ${display.className}` }, display.text)
                              ),
                              React.createElement(
                                "div",
                                { className: "shrink-0 flex items-center gap-2" },
                                React.createElement(
                                  "button",
                                  {
                                    type: "button",
                                    className:
                                      "w-12 h-12 rounded-xl bg-black/5 active:bg-black/10 text-slate-700 flex items-center justify-center",
                                    onClick: () => openEdit(it),
                                    "aria-label": "Edit"
                                  },
                                  React.createElement(EditIcon)
                                ),
                                React.createElement(
                                  "button",
                                  {
                                    type: "button",
                                    className:
                                      "w-12 h-12 rounded-xl bg-black/5 active:bg-black/10 text-slate-700 flex items-center justify-center",
                                    onClick: () => requestDelete(it.id),
                                    "aria-label": "Delete"
                                  },
                                  React.createElement(TrashIcon)
                                )
                              )
                            );
                          })
                        ),
                        hasMore
                          ? React.createElement(
                              "button",
                              {
                                type: "button",
                                className:
                                  "w-full px-4 py-2 rounded-xl bg-black/5 active:bg-black/10 text-sm text-slate-700",
                                onClick: () => toggleGroupExpanded(zone, category)
                              },
                              expanded ? "收起" : "展开更多"
                            )
                          : null
                      );
                    })
              )
            );
          })
        )
      ),
      React.createElement(ConfirmDialog, {
        open: confirmOpen,
        title: "确认删除",
        message: "这个食材已经用完或清理了吗？",
        confirmText: "是的，清理了",
        cancelText: "留着",
        onConfirm: confirmDelete,
        onCancel: cancelDelete
      }),
      React.createElement(
        Modal,
        { open: addOpen, title: "添加", onClose: closeAdd },
        React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "存放区域"),
            React.createElement(
              "div",
              { className: "flex gap-2" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `flex-1 h-10 rounded-xl text-sm border ${
                    addZone === "Fridge" ? "bg-[#2d5a27] text-white border-[#2d5a27]" : "bg-white border-black/10 text-slate-700"
                  }`,
                  onClick: () => onAddZoneChange("Fridge")
                },
                "❄️ Fridge"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `flex-1 h-10 rounded-xl text-sm border ${
                    addZone === "Freezer" ? "bg-[#2d5a27] text-white border-[#2d5a27]" : "bg-white border-black/10 text-slate-700"
                  }`,
                  onClick: () => onAddZoneChange("Freezer")
                },
                "🧊 Freezer"
              )
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "食物品类"),
            React.createElement(
              "select",
              {
                className: "w-full h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
                value: addCategory,
                onChange: (e) => onAddCategoryChange(e.target.value)
              },
              CATEGORY_ORDER.map((c) => React.createElement("option", { key: c, value: c }, `${CATEGORY_EMOJI[c] || "🥣"} ${CATEGORY_LABEL[c] || c}`))
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "食物名称"),
            React.createElement(
              "div",
              { className: "flex items-center gap-2" },
              React.createElement("input", {
                ref: addNameRef,
                className: "flex-1 h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
                value: addName,
                onChange: (e) => setAddName(e.target.value),
                placeholder: "请输入食物名称"
              }),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `w-12 h-12 rounded-xl flex items-center justify-center ${
                    isListening ? "bg-red-600 text-white animate-pulse" : "bg-black/5 text-slate-700"
                  } ${!speechSupported ? "opacity-40" : ""}`,
                  onClick: toggleSpeech,
                  disabled: !speechSupported,
                  "aria-label": "Voice input"
                },
                "🎙️"
              )
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "过期日期"),
            React.createElement("input", {
              type: "date",
              className: "w-full h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
              value: addExpiryDate,
              min: todayISO(),
              onChange: (e) => onAddExpiryDateChange(e.target.value)
            })
          ),
          addError
            ? React.createElement("div", { className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3" }, addError)
            : null,
          React.createElement(
            "div",
            { className: "space-y-2 pt-1" },
            React.createElement(
              "button",
              { type: "button", className: "w-full px-4 py-2 rounded-xl bg-black/5 active:bg-black/10", onClick: closeAdd },
              "取消"
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "w-full px-5 py-2 rounded-xl text-white shadow-md active:shadow-sm disabled:opacity-50",
                style: { backgroundColor: "#2d5a27", color: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
                onClick: onAddConfirm,
                disabled: addSubmitting
              },
              "确定"
            )
          )
        )
      )
      ,
      React.createElement(
        Modal,
        { open: editOpen, title: "编辑", onClose: closeEdit },
        React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "存放区域"),
            React.createElement(
              "div",
              { className: "flex gap-2" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `flex-1 h-10 rounded-xl text-sm border ${
                    editZone === "Fridge" ? "bg-[#2d5a27] text-white border-[#2d5a27]" : "bg-white border-black/10 text-slate-700"
                  }`,
                  onClick: () => onEditZoneChange("Fridge")
                },
                "❄️ Fridge"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `flex-1 h-10 rounded-xl text-sm border ${
                    editZone === "Freezer" ? "bg-[#2d5a27] text-white border-[#2d5a27]" : "bg-white border-black/10 text-slate-700"
                  }`,
                  onClick: () => onEditZoneChange("Freezer")
                },
                "🧊 Freezer"
              )
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "食物品类"),
            React.createElement(
              "select",
              {
                className: "w-full h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
                value: editCategory,
                onChange: (e) => onEditCategoryChange(e.target.value)
              },
              CATEGORY_ORDER.map((c) => React.createElement("option", { key: c, value: c }, `${CATEGORY_EMOJI[c] || "🥣"} ${CATEGORY_LABEL[c] || c}`))
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "食物名称"),
            React.createElement(
              "div",
              { className: "flex items-center gap-2" },
              React.createElement("input", {
                ref: editNameRef,
                className: "flex-1 h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
                value: editName,
                onChange: (e) => setEditName(e.target.value),
                placeholder: "请输入食物名称"
              }),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: `w-12 h-12 rounded-xl flex items-center justify-center ${
                    isListening ? "bg-red-600 text-white animate-pulse" : "bg-black/5 text-slate-700"
                  } ${!speechSupported ? "opacity-40" : ""}`,
                  onClick: toggleSpeech,
                  disabled: !speechSupported,
                  "aria-label": "Voice input"
                },
                "🎙️"
              )
            )
          ),
          React.createElement(
            "div",
            { className: "space-y-1" },
            React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "过期日期"),
            React.createElement("input", {
              type: "date",
              className: "w-full h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sage-300",
              value: editExpiryDate,
              min: todayISO(),
              onChange: (e) => onEditExpiryDateChange(e.target.value)
            })
          ),
          editError
            ? React.createElement("div", { className: "text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3" }, editError)
            : null,
          React.createElement(
            "div",
            { className: "space-y-2 pt-1" },
            React.createElement(
              "button",
              { type: "button", className: "w-full px-4 py-2 rounded-xl bg-black/5 active:bg-black/10", onClick: closeEdit },
              "取消"
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "w-full px-5 py-2 rounded-xl text-white shadow-md active:shadow-sm disabled:opacity-50",
                style: { backgroundColor: "#2d5a27", color: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
                onClick: onEditConfirm,
                disabled: editSubmitting
              },
              "确定"
            )
          )
        )
      )
    )
  );
}

const __fc = (window.__freshClock = window.__freshClock || {});
let __fcRootEl = document.getElementById("root");
if (!__fcRootEl) {
  __fcRootEl = document.createElement("div");
  __fcRootEl.id = "root";
  document.body.appendChild(__fcRootEl);
}

try {
  if (typeof ReactDOM?.createRoot === "function") {
    if (!__fc.root || __fc.rootEl !== __fcRootEl) {
      try { __fc.root?.unmount?.(); } catch {}
      __fc.rootEl = __fcRootEl;
      __fc.root = ReactDOM.createRoot(__fcRootEl);
    }
    __fc.root.render(React.createElement(App));
  } else if (typeof ReactDOM?.render === "function") {
    __fc.rootEl = __fcRootEl;
    __fc.root = null;
    ReactDOM.render(React.createElement(App), __fcRootEl);
  } else {
    throw new Error("ReactDOM 未正确加载（createRoot/render 不可用）");
  }
} catch (err) {
  console.error(err);
  const title = "FreshClock 发生错误";
  const detail = String(err?.message || err);
  __fcRootEl.innerHTML =
    '<div style="padding:16px;font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial;line-height:1.5">' +
    `<div style="font-weight:700;font-size:18px">${title}</div>` +
    `<div style="margin-top:8px;color:#475569;white-space:pre-wrap">${detail}</div>` +
    "</div>";
}
