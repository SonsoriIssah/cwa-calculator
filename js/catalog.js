// catalog.js — loads and filters the course catalog CSV (no external CSV lib dependency)

// The master CSV abbreviates programme names (e.g. "Computer Eng."); shown in
// full everywhere in the UI. Applied once at parse time so every downstream
// lookup (getYears, getCourses, etc.) just matches on the full name.
const PROGRAMME_DISPLAY_NAMES = {
  "Computer Eng.": "Computer Engineering",
  "Telecommunication Eng.": "Telecommunication Engineering",
  "Biomedical Eng.": "Biomedical Engineering",
  "Electrical/Electronic": "Electrical/Electronic Engineering",
};

async function loadCatalog(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

function parseCsv(text) {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = cells[idx].trim();
    });
    row.year = Number(row.year);
    row.semester = Number(row.semester);
    row.credits = Number(row.credits);
    row.programme = PROGRAMME_DISPLAY_NAMES[row.programme] || row.programme;
    rows.push(row);
  }
  return rows;
}

// Handles simple quoted fields (e.g. "Course, With Comma") in addition to plain comma-separated values.
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function getProgrammes(data) {
  return [...new Set(data.map((r) => r.programme))].sort();
}

function getYears(data, programme) {
  return [...new Set(data.filter((r) => r.programme === programme).map((r) => r.year))].sort(
    (a, b) => a - b
  );
}

function getSemesters(data, programme, year) {
  return [
    ...new Set(
      data.filter((r) => r.programme === programme && r.year === year).map((r) => r.semester)
    ),
  ].sort((a, b) => a - b);
}

function getCourses(data, programme, year, semester) {
  return data.filter(
    (r) => r.programme === programme && r.year === year && r.semester === semester
  );
}

// Sums credits for every semester of `programme` that comes strictly before
// (year, semester) in catalog order — used to auto-calculate prior credit hours.
function getPriorCredits(data, programme, year, semester) {
  return data
    .filter(
      (r) =>
        r.programme === programme &&
        (r.year < year || (r.year === year && r.semester < semester))
    )
    .reduce((sum, r) => sum + r.credits, 0);
}

window.Catalog = {
  loadCatalog,
  parseCsv,
  getProgrammes,
  getYears,
  getSemesters,
  getCourses,
  getPriorCredits,
};
