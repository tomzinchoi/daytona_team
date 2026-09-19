import type { OptimizationWeights } from "../shared/types.js";
import { numberIn, record, requireInput } from "./validation.js";

export const DEFAULT_WEIGHTS: OptimizationWeights = { quality: 0.50, latency: 0.30, resource: 0.20 };

export function validateWeights(weights: unknown): asserts weights is OptimizationWeights {
  record(weights, "weights");
  numberIn(weights.quality, "weights.quality", 0, 1);
  numberIn(weights.latency, "weights.latency", 0, 1);
  numberIn(weights.resource, "weights.resource", 0, 1);
  requireInput(Math.abs(weights.quality + weights.latency + weights.resource - 1) < 1e-9, "Optimization weights must sum to 1");
}

/** A tied dimension gives equal full utility; no division by zero. */
export function normalizedUtility(value: number, values: number[], maximize: boolean): number {
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return 1;
  return maximize ? (value - min) / (max - min) : (max - value) / (max - min);
}
