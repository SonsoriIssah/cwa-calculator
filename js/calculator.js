// calculator.js — CWA math and per-course target-splitting.
// Kept isolated from catalog.js/app.js so the split formula (the part most
// likely to change) can be unit-tested and revised independently of the UI.

const HARD_CAP = 100; // mathematically impossible above this
const SOFT_CAP = 90; // "unlikely" — flagged as risky in the Balanced/Equal plans
const SAFETY_CAP = 85; // ceiling the Safety plan refuses to ask for in any single course
const MIN_SCORE = 0;
const SPREAD_STRENGTH = 6; // tunable: how far low-credit courses swing from the required average
const MAX_REDISTRIBUTE_ROUNDS = 20;

// required_average_this_semester — the overall average the new semester needs.
function requiredAverage(priorCWA, priorCredits, desiredCWA, newCredits) {
  const priorPoints = priorCWA * priorCredits;
  const targetPoints = desiredCWA * (priorCredits + newCredits);
  const requiredPoints = targetPoints - priorPoints;
  return {
    requiredPoints,
    requiredAverage: newCredits > 0 ? requiredPoints / newCredits : null,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// The actual cumulative CWA a plan produces once its (rounded, possibly
// capped) per-course targets are hit — as opposed to the semester-only
// average, this is the number that answers "does this plan reach my goal?".
function projectedCumulativeCWA(priorPoints, priorCredits, newCredits, courses) {
  const achievedPoints = courses.reduce((s, c) => s + c.target * c.credits, 0);
  const totalCredits = priorCredits + newCredits;
  return totalCredits > 0 ? (priorPoints + achievedPoints) / totalCredits : null;
}

// Inverse-credit-weighted split: lower-credit courses absorb more of the swing
// away from the required average; higher-credit courses stay closer to it.
// By construction, Σ(credit_i * deviation_i) == 0, so the credit-weighted mean
// of the *unclamped* targets always equals `avgTarget` exactly.
function splitTargets(avgTarget, courses) {
  const n = courses.length;
  const totalCredits = courses.reduce((s, c) => s + c.credits, 0);
  if (n === 0 || totalCredits === 0) return [];

  const rawShape = courses.map((c) => 1 / c.credits - n / totalCredits);
  const maxAbsShape = Math.max(...rawShape.map(Math.abs), 1e-9);

  return courses.map((c, i) => {
    const deviation = (rawShape[i] / maxAbsShape) * SPREAD_STRENGTH;
    const rawTarget = avgTarget + deviation;
    return annotate(c, rawTarget);
  });
}

// Same target score for every course, regardless of credit weight.
function equalSplit(avgTarget, courses) {
  return courses.map((c) => annotate(c, avgTarget));
}

function annotate(course, rawTarget) {
  return {
    ...course,
    rawTarget,
    target: Math.round(clamp(rawTarget, MIN_SCORE, HARD_CAP)),
    flagged: rawTarget >= SOFT_CAP,
    impossible: rawTarget > HARD_CAP,
  };
}

// Iteratively caps any course whose split target would reach `capValue` or
// above, redistributing the points it no longer contributes across the
// remaining courses (capping one course can push another over the cap too,
// hence the loop). Used for the Safety plan (capValue = SAFETY_CAP), which
// promises to never ask for more than `capValue` in any single course.
function buildCappedPlan(requiredPoints, courses, capValue) {
  const capped = new Set();
  let remainingCourses = [...courses];
  let remainingPoints = requiredPoints;
  let achievable = true;

  for (let round = 0; round < MAX_REDISTRIBUTE_ROUNDS; round++) {
    const remainingCredits = remainingCourses.reduce((s, c) => s + c.credits, 0);
    if (remainingCredits === 0) {
      achievable = false;
      break;
    }
    const newAvg = remainingPoints / remainingCredits;

    if (newAvg > capValue) {
      // Can't hit the required points without breaking the safety cap.
      achievable = false;
      remainingCourses = remainingCourses.map((c) => ({
        ...c,
        rawTarget: capValue,
        target: capValue,
        flagged: false,
        impossible: false,
      }));
      break;
    }

    const split = splitTargets(newAvg, remainingCourses);
    const overflow = split.filter((c) => c.target >= capValue);
    if (overflow.length === 0) {
      remainingCourses = split;
      break;
    }

    overflow.forEach((c) => capped.add(c.course_code));
    remainingPoints -= overflow.reduce((s, c) => s + capValue * c.credits, 0);
    remainingCourses = split.filter((c) => !capped.has(c.course_code));
  }

  const cappedResults = courses
    .filter((c) => capped.has(c.course_code))
    .map((c) => ({
      ...c,
      rawTarget: capValue,
      target: capValue,
      flagged: false,
      impossible: false,
      capped: true,
    }));
  const finalResults = [...cappedResults, ...remainingCourses];
  finalResults.sort(
    (a, b) =>
      courses.findIndex((c) => c.course_code === a.course_code) -
      courses.findIndex((c) => c.course_code === b.course_code)
  );

  return { courses: finalResults, achievable };
}

// Top-level entry point: given the student's inputs and this semester's
// course list, returns 3 alternative plans plus any warnings.
function generatePlans({ priorCWA, priorCredits, desiredCWA, courses }) {
  const newCredits = courses.reduce((s, c) => s + c.credits, 0);
  const priorPoints = priorCWA * priorCredits;
  const { requiredPoints, requiredAverage: avg } = requiredAverage(
    priorCWA,
    priorCredits,
    desiredCWA,
    newCredits
  );

  const warnings = [];
  if (avg === null) {
    warnings.push("No courses selected for this semester.");
    return { requiredAverage: null, desiredCWA, plans: [], warnings };
  }
  if (avg > HARD_CAP) {
    warnings.push(
      `Target CWA is not achievable this semester even with 100 in every course (would need an average of ${avg.toFixed(
        1
      )}).`
    );
  } else if (avg < MIN_SCORE) {
    warnings.push(
      "Target CWA is already exceeded by your prior CWA — no minimum average is required this semester."
    );
  }

  const clampedAvg = clamp(avg, MIN_SCORE, HARD_CAP);

  const balancedCourses = splitTargets(clampedAvg, courses);
  const equalCourses = equalSplit(clampedAvg, courses);

  const safetyResult = buildCappedPlan(requiredPoints, courses, SAFETY_CAP);
  const safetyWarnings = [];
  if (!safetyResult.achievable) {
    safetyWarnings.push(
      `Can't reach this target while keeping every course at or below ${SAFETY_CAP} — this plan shows the closest outcome without breaking that cap.`
    );
  }

  const makePlan = (key, label, description, planCourses, planWarnings) => {
    const projected = projectedCumulativeCWA(priorPoints, priorCredits, newCredits, planCourses);
    const finalWarnings = [...planWarnings];
    // Rounding whole-number targets can miss the exact desired CWA by a hair;
    // only worth flagging if it's not already explained by a bigger warning.
    if (planWarnings.length === 0 && projected !== null && Math.abs(projected - desiredCWA) > 0.1) {
      const direction = projected < desiredCWA ? "just under" : "just over";
      finalWarnings.push(
        `Rounding whole-number targets lands this plan ${direction} your goal — projected cumulative CWA ${projected.toFixed(
          2
        )} vs. desired ${desiredCWA.toFixed(2)}.`
      );
    }
    return {
      key,
      label,
      description,
      courses: planCourses,
      projectedCumulativeCWA: projected,
      warnings: finalWarnings,
    };
  };

  const plans = [
    makePlan(
      "balanced",
      "Balanced Plan",
      "Credit-weighted split — lower-credit courses swing further from the average, higher-credit courses stay closer to it.",
      balancedCourses,
      []
    ),
    makePlan(
      "equal",
      "Equal Split Plan",
      "The same target score in every course — simplest to aim for.",
      equalCourses,
      []
    ),
    makePlan(
      "safety",
      "Safety Plan",
      `No single course is ever targeted above ${SAFETY_CAP} — the shortfall is redistributed across the others.`,
      safetyResult.courses,
      safetyWarnings
    ),
  ];

  return { requiredAverage: avg, desiredCWA, plans, warnings };
}

window.Calculator = {
  requiredAverage,
  splitTargets,
  equalSplit,
  buildCappedPlan,
  projectedCumulativeCWA,
  generatePlans,
  HARD_CAP,
  SOFT_CAP,
  SAFETY_CAP,
};
