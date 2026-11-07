export const defaultGrades = [
  { label: "A+", min: 90 },
  { label: "A", min: 80 },
  { label: "B+", min: 70 },
  { label: "B", min: 60 },
  { label: "C", min: 50 },
  { label: "D", min: 33 },
  { label: "E", min: 0 },
];
export function gradeFor(percentage: number, bands = defaultGrades) {
  return (
    [...bands].sort((a, b) => b.min - a.min).find((b) => percentage >= b.min)
      ?.label || "—"
  );
}
