const NEGATIVE_TERMS = ["chips", "flavored", "canned", "frozen", "dried", "cookie", "snack", "soda", "ramen", "chocolate"];

const NEGATIVE_RE = new RegExp(`\\b(?:${NEGATIVE_TERMS.join("|")})\\b`, "i");

const POSITIVE_RULES = [
  { category: "Meat", expiryDays: 3, re: /\bchicken\s+breast\b/i, name: "Chicken Breast" },
  { category: "Meat", expiryDays: 3, re: /\bchicken\b/i, name: "Chicken" },
  { category: "Meat", expiryDays: 3, re: /\bbeef\b/i, name: "Beef" },
  { category: "Meat", expiryDays: 3, re: /\bpork\b/i, name: "Pork" },
  { category: "Seafood", expiryDays: 2, re: /\bsalmon\s+fillet\b/i, name: "Salmon Fillet" },
  { category: "Seafood", expiryDays: 2, re: /\bsalmon\b/i, name: "Salmon" },
  { category: "Seafood", expiryDays: 2, re: /\bshrimp\b/i, name: "Shrimp" },
  { category: "Seafood", expiryDays: 2, re: /\btuna\b/i, name: "Tuna" },
  { category: "Produce", expiryDays: 5, re: /\bspinach\b/i, name: "Spinach" },
  { category: "Produce", expiryDays: 5, re: /\blettuce\b/i, name: "Lettuce" },
  { category: "Produce", expiryDays: 5, re: /\bkale\b/i, name: "Kale" },
  { category: "Produce", expiryDays: 5, re: /\bbroccoli\b/i, name: "Broccoli" },
  { category: "Dairy", expiryDays: 7, re: /\borganic\s+milk\b/i, name: "Organic Milk" },
  { category: "Dairy", expiryDays: 7, re: /\bmilk\b/i, name: "Milk" },
  { category: "Eggs", expiryDays: 14, re: /\beggs?\b/i, name: "Eggs" },
  { category: "Bakery", expiryDays: 4, re: /\bbaguette\b/i, name: "Baguette" },
  { category: "Bakery", expiryDays: 4, re: /\bbread\b/i, name: "Bread" },
  { category: "Bakery", expiryDays: 4, re: /\bcroissant\b/i, name: "Croissant" },
  { category: "Bakery", expiryDays: 4, re: /\bbagel\b/i, name: "Bagel" }
];

function normalizeLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function shouldExclude(line) {
  return NEGATIVE_RE.test(line);
}

function analyzeLine(line) {
  const cleaned = normalizeLine(line);
  if (!cleaned) return null;
  if (shouldExclude(cleaned)) return null;

  for (const rule of POSITIVE_RULES) {
    if (rule.re.test(cleaned)) {
      return { name: rule.name, category: rule.category, expiryDays: rule.expiryDays, sourceLine: cleaned };
    }
  }

  return null;
}

export function parseReceiptText(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const hit = analyzeLine(line);
    if (!hit) continue;
    const key = `${hit.category}::${hit.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name: hit.name, category: hit.category, expiryDays: hit.expiryDays });
  }

  return results;
}
