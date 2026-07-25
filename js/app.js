// app.js — DOM wiring. Keeps UI concerns out of catalog.js/calculator.js.

let catalogData = [];
let currentCourses = []; // [{course_code, course_name, credits, included}]
let manualCourseCounter = 0;
let currentSelection = { programme: "", year: null, semester: null };
let latestResult = null; // last Calculator.generatePlans() output
let activePlanKey = null;

const el = (id) => document.getElementById(id);

async function init() {
  try {
    catalogData = await Catalog.loadCatalog("data/courses.csv");
  } catch (err) {
    el("catalog-status").textContent = `Could not load course catalog: ${err.message}`;
    return;
  }

  const programmes = Catalog.getProgrammes(catalogData);
  const datalist = el("programme-options");
  datalist.innerHTML = programmes.map((p) => `<option value="${escapeHtml(p)}">`).join("");
  el("catalog-status").textContent = `${programmes.length} programme(s) loaded from catalog.`;

  el("programme-input").addEventListener("input", onProgrammeChange);
  el("year-select").addEventListener("change", onYearChange);
  el("semester-select").addEventListener("change", onSemesterChange);
  el("add-course-btn").addEventListener("click", onAddCourse);
  el("generate-btn").addEventListener("click", onGeneratePlan);
  el("download-png-btn").addEventListener("click", onDownloadPng);
  el("download-pdf-btn").addEventListener("click", onDownloadPdf);
}

function onProgrammeChange() {
  const programme = el("programme-input").value;
  const years = Catalog.getYears(catalogData, programme);
  const yearSelect = el("year-select");

  resetDownstream(["year-select", "semester-select"]);
  hide("courses-card");
  hide("cwa-card");
  hide("results-card");

  if (years.length === 0) {
    yearSelect.disabled = true;
    return;
  }

  yearSelect.innerHTML =
    `<option value="">Select year</option>` +
    years.map((y) => `<option value="${y}">Year ${y}</option>`).join("");
  yearSelect.disabled = false;
}

function onYearChange() {
  const programme = el("programme-input").value;
  const year = Number(el("year-select").value);
  const semesterSelect = el("semester-select");

  resetDownstream(["semester-select"]);
  hide("courses-card");
  hide("cwa-card");
  hide("results-card");

  if (!year) {
    semesterSelect.disabled = true;
    return;
  }

  const semesters = Catalog.getSemesters(catalogData, programme, year);
  semesterSelect.innerHTML =
    `<option value="">Select semester</option>` +
    semesters.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
  semesterSelect.disabled = false;
}

function onSemesterChange() {
  const programme = el("programme-input").value;
  const year = Number(el("year-select").value);
  const semester = Number(el("semester-select").value);

  hide("results-card");

  if (!semester) {
    hide("courses-card");
    hide("cwa-card");
    return;
  }

  currentSelection = { programme, year, semester };

  const courses = Catalog.getCourses(catalogData, programme, year, semester);
  currentCourses = courses.map((c) => ({
    course_code: c.course_code,
    course_name: c.course_name,
    credits: c.credits,
    included: true,
  }));

  renderCourseTable();

  const priorCredits = Catalog.getPriorCredits(catalogData, programme, year, semester);
  el("prior-credits-value").textContent = priorCredits;

  show("courses-card");
  show("cwa-card");
}

function renderCourseTable() {
  const tbody = el("course-table-body");
  tbody.innerHTML = currentCourses
    .map(
      (c, i) => `
      <tr>
        <td><input type="checkbox" data-idx="${i}" class="course-toggle" ${c.included ? "checked" : ""}></td>
        <td>${escapeHtml(c.course_code)}</td>
        <td>${escapeHtml(c.course_name)}</td>
        <td>${c.credits}</td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".course-toggle").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      currentCourses[idx].included = e.target.checked;
    });
  });
}

function onAddCourse() {
  const nameInput = el("add-course-name");
  const creditsInput = el("add-course-credits");
  const name = nameInput.value.trim();
  const credits = Number(creditsInput.value);

  if (!name || !credits || credits <= 0) {
    return;
  }

  manualCourseCounter += 1;
  currentCourses.push({
    course_code: `MANUAL-${manualCourseCounter}`,
    course_name: name,
    credits,
    included: true,
  });

  nameInput.value = "";
  creditsInput.value = "";
  renderCourseTable();
}

function onGeneratePlan() {
  const priorCWA = Number(el("prior-cwa-input").value);
  const desiredCWA = Number(el("desired-cwa-input").value);
  const priorCredits = Number(el("prior-credits-value").textContent);
  const errorEl = el("input-error");

  if (!el("prior-cwa-input").value || !el("desired-cwa-input").value) {
    errorEl.textContent = "Enter both your previous CWA and desired CWA.";
    return;
  }
  if (priorCWA < 0 || priorCWA > 100 || desiredCWA < 0 || desiredCWA > 100) {
    errorEl.textContent = "CWA values must be between 0 and 100.";
    return;
  }

  const includedCourses = currentCourses.filter((c) => c.included);
  if (includedCourses.length === 0) {
    errorEl.textContent = "Select at least one course for this semester.";
    return;
  }

  errorEl.textContent = "";

  const result = Calculator.generatePlans({
    priorCWA,
    priorCredits,
    desiredCWA,
    courses: includedCourses,
  });

  renderResults(result);
}

function renderResults(result) {
  latestResult = result;
  activePlanKey = result.plans.length > 0 ? result.plans[0].key : null;

  const warningsEl = el("warnings");
  warningsEl.innerHTML = result.warnings
    .map((w) => `<div class="warning-box">${escapeHtml(w)}</div>`)
    .join("");

  el("required-average-value").textContent =
    result.requiredAverage === null ? "—" : result.requiredAverage.toFixed(2);

  renderPlanTabs();
  renderActivePlan();

  show("results-card");
}

function renderPlanTabs() {
  const tabsEl = el("plan-tabs");
  if (!latestResult || latestResult.plans.length === 0) {
    tabsEl.innerHTML = "";
    return;
  }
  tabsEl.innerHTML = latestResult.plans
    .map(
      (p) => `
      <button type="button" class="plan-tab${p.key === activePlanKey ? " active" : ""}" data-key="${p.key}" role="tab">
        ${escapeHtml(p.label)}
      </button>`
    )
    .join("");

  tabsEl.querySelectorAll(".plan-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activePlanKey = btn.dataset.key;
      renderPlanTabs();
      renderActivePlan();
    });
  });
}

function getActivePlan() {
  if (!latestResult) return null;
  return latestResult.plans.find((p) => p.key === activePlanKey) || null;
}

function renderActivePlan() {
  const plan = getActivePlan();
  if (!plan) return;

  el("plan-description").textContent = plan.description;

  const planWarningsEl = el("plan-warnings");
  planWarningsEl.innerHTML = plan.warnings
    .map((w) => `<div class="warning-box">${escapeHtml(w)}</div>`)
    .join("");

  el("plan-table-body").innerHTML = plan.courses
    .map((c) => {
      const flaggedClass = c.capped ? "target-capped" : c.impossible || c.flagged ? "target-flagged" : "";
      const label = c.impossible ? `${c.target}+` : c.capped ? `${c.target} (capped)` : c.target;
      return `
        <tr>
          <td>${escapeHtml(c.course_name)}</td>
          <td>${c.credits}</td>
          <td class="${flaggedClass}">${label}</td>
        </tr>`;
    })
    .join("");
}

function buildExportMeta(plan) {
  const { programme, year, semester } = currentSelection;
  return {
    subtitle: `${programme} — Year ${year} Semester ${semester}`,
    planLabel: plan.label,
    description: plan.description,
    requiredAverageText:
      latestResult.requiredAverage === null ? "—" : latestResult.requiredAverage.toFixed(2),
    courses: plan.courses,
  };
}

function exportFilename(plan, extension) {
  const { programme, year, semester } = currentSelection;
  const slug = `${programme}-y${year}s${semester}-${plan.key}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}.${extension}`;
}

function onDownloadPng() {
  const plan = getActivePlan();
  if (!plan) return;
  const canvas = PlanExport.renderPlanCanvas(buildExportMeta(plan));
  PlanExport.downloadCanvasAsPng(canvas, exportFilename(plan, "png"));
}

function onDownloadPdf() {
  const plan = getActivePlan();
  if (!plan) return;
  PlanExport.downloadPlanAsPdf(buildExportMeta(plan), exportFilename(plan, "pdf"));
}

function resetDownstream(ids) {
  ids.forEach((id) => {
    const elm = el(id);
    elm.innerHTML = `<option value="">Select ${id.includes("year") ? "year" : "semester"}</option>`;
    elm.disabled = true;
  });
}

function show(id) { el(id).hidden = false; }
function hide(id) { el(id).hidden = true; }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
