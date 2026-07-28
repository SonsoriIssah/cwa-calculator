// app.js — DOM wiring. Keeps UI concerns out of catalog.js/calculator.js.

let catalogData = [];
let currentCourses = []; // [{course_code, course_name, credits, included}]
let manualCourseCounter = 0;
let currentSelection = { programme: "", year: null, semester: null };
let latestResult = null; // last Calculator.generatePlans() output
let activePlanKey = null;
let programmeMatches = [];
let programmeHighlight = -1;

const RING_CIRCUMFERENCE = 527; // 2π × r(84), matches the SVG circle in index.html

const el = (id) => document.getElementById(id);

async function init() {
  try {
    catalogData = await Catalog.loadCatalog("data/courses.csv");
  } catch (err) {
    el("catalog-status").textContent = `Could not load course catalog: ${err.message}`;
    return;
  }

  const programmes = Catalog.getProgrammes(catalogData);
  el("catalog-status").textContent = `${programmes.length} programme(s) loaded from catalog.`;

  const programmeInput = el("programme-input");
  programmeInput.addEventListener("input", () => {
    updateProgrammeDropdown();
    onProgrammeChange();
  });
  programmeInput.addEventListener("focus", updateProgrammeDropdown);
  programmeInput.addEventListener("keydown", onProgrammeKeydown);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete")) closeProgrammeDropdown();
  });

  el("year-select").addEventListener("change", onYearChange);
  el("semester-select").addEventListener("change", onSemesterChange);
  el("add-course-btn").addEventListener("click", onAddCourse);
  el("generate-btn").addEventListener("click", onGeneratePlan);
  el("reset-btn").addEventListener("click", onReset);
  el("download-png-btn").addEventListener("click", onDownloadPng);
  el("download-pdf-btn").addEventListener("click", onDownloadPdf);

  setStep(1);
}

function setStep(n) {
  document.querySelectorAll(".step-chip").forEach((chip) => {
    const s = Number(chip.dataset.step);
    chip.classList.remove("done", "current");
    if (s < n) chip.classList.add("done");
    else if (s === n) chip.classList.add("current");
  });
}

function updateProgrammeDropdown() {
  const query = el("programme-input").value.trim().toLowerCase();
  const programmes = Catalog.getProgrammes(catalogData);
  programmeMatches = query ? programmes.filter((p) => p.toLowerCase().includes(query)) : programmes;
  programmeHighlight = -1;
  renderProgrammeDropdown();
}

function renderProgrammeDropdown() {
  const dropdown = el("programme-dropdown");
  const input = el("programme-input");

  if (programmeMatches.length === 0) {
    closeProgrammeDropdown();
    return;
  }

  dropdown.innerHTML = programmeMatches
    .map(
      (p, i) => `
      <li class="autocomplete-item${i === programmeHighlight ? " highlighted" : ""}" role="option" data-value="${escapeHtml(p)}">
        ${escapeHtml(p)}
      </li>`
    )
    .join("");
  dropdown.hidden = false;
  input.setAttribute("aria-expanded", "true");

  dropdown.querySelectorAll(".autocomplete-item").forEach((li) => {
    // mousedown (not click) fires before the input's blur, so the value is
    // set before the dropdown gets torn down by the blur/outside-click handler.
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectProgramme(li.dataset.value);
    });
  });
}

function closeProgrammeDropdown() {
  const dropdown = el("programme-dropdown");
  dropdown.hidden = true;
  dropdown.innerHTML = "";
  el("programme-input").setAttribute("aria-expanded", "false");
  programmeHighlight = -1;
}

function selectProgramme(name) {
  el("programme-input").value = name;
  closeProgrammeDropdown();
  onProgrammeChange();
}

function onProgrammeKeydown(e) {
  if (el("programme-dropdown").hidden && e.key !== "Escape") return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    programmeHighlight = Math.min(programmeHighlight + 1, programmeMatches.length - 1);
    renderProgrammeDropdown();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    programmeHighlight = Math.max(programmeHighlight - 1, 0);
    renderProgrammeDropdown();
  } else if (e.key === "Enter") {
    if (programmeHighlight >= 0 && programmeMatches[programmeHighlight]) {
      e.preventDefault();
      selectProgramme(programmeMatches[programmeHighlight]);
    }
  } else if (e.key === "Escape") {
    closeProgrammeDropdown();
  }
}

function onProgrammeChange() {
  const programme = el("programme-input").value;
  const years = Catalog.getYears(catalogData, programme);
  const yearSelect = el("year-select");

  resetDownstream(["year-select", "semester-select"]);
  hide("courses-card");
  hide("cwa-card");
  hide("results-card");
  setStep(1);

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
  setStep(1);

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
    setStep(1);
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
  setStep(3);
}

function renderCourseTable() {
  const container = el("course-table-body");
  container.innerHTML = currentCourses
    .map(
      (c, i) => `
      <div class="flex items-center justify-between p-md bg-surface-container rounded-xl border border-outline-variant">
        <div class="flex items-center gap-md">
          <input type="checkbox" data-idx="${i}" class="course-toggle w-5 h-5 rounded text-primary focus:ring-primary" ${c.included ? "checked" : ""}>
          <div>
            <p class="font-label-md">${escapeHtml(c.course_name)}</p>
            <p class="text-label-sm text-on-surface-variant">${escapeHtml(c.course_code)} · ${c.credits} Credit Hour${c.credits === 1 ? "" : "s"}</p>
          </div>
        </div>
      </div>`
    )
    .join("");

  container.querySelectorAll(".course-toggle").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      currentCourses[idx].included = e.target.checked;
      updateCourseSummary();
    });
  });

  updateCourseSummary();
}

function updateCourseSummary() {
  const included = currentCourses.filter((c) => c.included);
  const totalCredits = included.reduce((s, c) => s + c.credits, 0);
  el("course-summary").textContent = `${included.length} course${included.length === 1 ? "" : "s"} · ${totalCredits} total credit hour${totalCredits === 1 ? "" : "s"}`;
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

  renderResults(result, { priorCWA, priorCredits });
}

function renderResults(result, { priorCWA, priorCredits }) {
  latestResult = result;
  activePlanKey = result.plans.length > 0 ? result.plans[0].key : null;

  const warningsEl = el("warnings");
  warningsEl.innerHTML = result.warnings
    .map((w) => `<div class="warning-box">${escapeHtml(w)}</div>`)
    .join("");

  el("desired-cwa-value").textContent = result.desiredCWA.toFixed(2);
  el("required-average-value").textContent =
    result.requiredAverage === null ? "—" : result.requiredAverage.toFixed(1);

  const pct = result.requiredAverage === null ? 0 : Math.max(0, Math.min(1, result.requiredAverage / 100));
  el("progress-ring-circle").setAttribute(
    "stroke-dashoffset",
    String(RING_CIRCUMFERENCE * (1 - pct))
  );

  const { programme, year, semester } = currentSelection;
  el("stat-semester").textContent = `Yr ${year} Sem ${semester}`;
  el("stat-credits").textContent = result.newCredits;
  el("stat-current-cwa").textContent = priorCWA.toFixed(2);
  el("stat-target-cwa").textContent = result.desiredCWA.toFixed(2);

  renderPlanTabs();
  renderActivePlan();

  show("results-card");
  setStep(4);
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

  const projected = plan.projectedCumulativeCWA;
  const projectedEl = el("projected-cwa-value");
  const onTarget = projected !== null && Math.abs(projected - latestResult.desiredCWA) <= 0.1;
  projectedEl.textContent = projected === null ? "—" : projected.toFixed(2);
  projectedEl.className = projected === null ? "" : onTarget ? "on-target" : "off-target";

  const planWarningsEl = el("plan-warnings");
  planWarningsEl.innerHTML = plan.warnings
    .map((w) => `<div class="warning-box">${escapeHtml(w)}</div>`)
    .join("");

  el("plan-table-body").innerHTML = plan.courses
    .map((c) => {
      const barColor = c.impossible ? "bg-error" : c.capped ? "bg-amber-500" : "bg-primary";
      const scoreClass = c.impossible || c.flagged ? "text-error font-bold" : c.capped ? "text-amber-600 font-bold" : "font-bold text-primary";
      const rowBg = c.impossible ? "bg-error-container/10" : "";
      const label = c.impossible ? `${c.target}+` : String(c.target);
      const badge = c.impossible
        ? `<div class="mt-1"><span class="bg-error text-on-error px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Unachievable</span></div>`
        : c.capped
        ? `<div class="mt-1"><span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Capped</span></div>`
        : "";
      const barPct = Math.max(0, Math.min(100, c.target));

      return `
        <tr class="hover:bg-surface-bright transition-colors ${rowBg}">
          <td class="px-lg py-md font-label-md">${escapeHtml(c.course_name)}</td>
          <td class="px-lg py-md text-center">${c.credits}</td>
          <td class="px-lg py-md text-right">
            <span class="${scoreClass}">${label}</span>
            ${badge}
          </td>
          <td class="px-lg py-md">
            <div class="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
              <div class="${barColor} h-full" style="width:${barPct}%"></div>
            </div>
          </td>
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
    desiredCwaText: latestResult.desiredCWA.toFixed(2),
    projectedCwaText:
      plan.projectedCumulativeCWA === null ? "—" : plan.projectedCumulativeCWA.toFixed(2),
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

function onReset() {
  el("programme-input").value = "";
  closeProgrammeDropdown();
  resetDownstream(["year-select", "semester-select"]);
  hide("courses-card");
  hide("cwa-card");
  hide("results-card");

  currentCourses = [];
  currentSelection = { programme: "", year: null, semester: null };
  latestResult = null;
  activePlanKey = null;

  el("prior-cwa-input").value = "";
  el("desired-cwa-input").value = "";
  el("input-error").textContent = "";

  setStep(1);
  el("programme-input").scrollIntoView({ behavior: "smooth", block: "center" });
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
