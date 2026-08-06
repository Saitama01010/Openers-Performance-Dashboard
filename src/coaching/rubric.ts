export type RubricSection = {
  id: string;
  label: string;
  criteria: Array<{
    id: string;
    label: string;
    description?: string;
    maximumScore: number;
    required: boolean;
  }>;
};

export type CriterionScore = {
  criterionId: string;
  score: number;
  note?: string;
};

export function validateRubricSections(sections: readonly RubricSection[]) {
  if (sections.length === 0) throw new Error("At least one rubric section is required.");
  const sectionIds = new Set<string>();
  const criterionIds = new Set<string>();
  for (const section of sections) {
    if (!section.id.trim() || !section.label.trim() || sectionIds.has(section.id)) {
      throw new Error("Rubric section identifiers and labels must be unique and non-empty.");
    }
    sectionIds.add(section.id);
    if (section.criteria.length === 0) throw new Error("Every rubric section needs criteria.");
    for (const criterion of section.criteria) {
      if (
        !criterion.id.trim() ||
        !criterion.label.trim() ||
        criterionIds.has(criterion.id) ||
        !Number.isFinite(criterion.maximumScore) ||
        criterion.maximumScore <= 0
      ) {
        throw new Error("Rubric criteria must have unique identifiers and positive maximum scores.");
      }
      criterionIds.add(criterion.id);
    }
  }
}

export function calculateRubricPercentage(
  sections: readonly RubricSection[],
  submittedScores: readonly CriterionScore[],
) {
  validateRubricSections(sections);
  const scoreByCriterion = new Map(submittedScores.map((score) => [score.criterionId, score]));
  const knownIds = new Set(sections.flatMap((section) => section.criteria.map((criterion) => criterion.id)));
  if (submittedScores.some((score) => !knownIds.has(score.criterionId))) {
    throw new Error("A submitted criterion does not belong to this rubric version.");
  }
  let earned = 0;
  let maximum = 0;
  for (const criterion of sections.flatMap((section) => section.criteria)) {
    const submitted = scoreByCriterion.get(criterion.id);
    if (!submitted) {
      if (criterion.required) throw new Error(`A score is required for ${criterion.label}.`);
      continue;
    }
    if (
      !Number.isFinite(submitted.score) ||
      submitted.score < 0 ||
      submitted.score > criterion.maximumScore
    ) {
      throw new Error(`The score for ${criterion.label} is outside its configured scale.`);
    }
    earned += submitted.score;
    maximum += criterion.maximumScore;
  }
  if (maximum <= 0) throw new Error("At least one criterion must be scored.");
  return Math.round((earned / maximum) * 10_000) / 100;
}
