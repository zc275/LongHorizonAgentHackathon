import { z } from "zod";
import type { CandidateObservation } from "./domain.js";

const unknownableCount = z.union([z.number().int().nonnegative(), z.literal("unknown")]);
const unknownableBoolean = z.union([z.boolean(), z.literal("unknown")]);

export const candidateObservationSchema = z.object({
  frame_id: z.string().min(1),
  observed_at_seconds: z.number().finite().nonnegative(),
  camera_view: z.enum(["usable", "occluded", "unusable", "unknown"]),
  children_visible: unknownableCount,
  children_in_cribs: unknownableCount,
  children_outside_cribs: unknownableCount,
  caregiver_visible: unknownableBoolean,
  activity_level: z.enum(["quiet", "moving", "active_play", "unknown"]),
  pillows_on_floor: unknownableBoolean,
  uncertainties: z.array(z.string()),
  short_description: z.string().min(1).max(500)
}).superRefine((observation, context) => {
  const visible = observation.children_visible;
  const inCribs = observation.children_in_cribs;
  const outside = observation.children_outside_cribs;

  if (typeof visible === "number" && typeof inCribs === "number" && typeof outside === "number") {
    if (inCribs + outside > visible) {
      context.addIssue({
        code: "custom",
        path: ["children_visible"],
        message: "crib and outside counts cannot exceed visible children"
      });
    }
  }
});

export function validateObservation(input: unknown):
  | { success: true; data: CandidateObservation }
  | { success: false; errors: string[] } {
  const result = candidateObservationSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "observation"}: ${issue.message}`)
  };
}
