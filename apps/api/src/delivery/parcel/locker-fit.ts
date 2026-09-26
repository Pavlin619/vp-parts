import type { PackageSizeCm } from '../../tecdoc';
import type { Parcel } from './parcel-estimate';

export interface LockerLimits {
  /** The largest cell's inside, in centimetres. */
  maxSidesCm: [number, number, number];
  maxWeightGrams: number;
  /** Share of the cell's volume boxes can fill once they are packed together. */
  fillFactor: number;
}

export function fitsLocker(parcel: Parcel, limits: LockerLimits): boolean {
  const units = parcel.unitsCm;

  if (!units || units.length === 0) {
    return false;
  }

  const cell = sortedSides(limits.maxSidesCm);
  const cellVolume = cell[0] * cell[1] * cell[2];

  const isWithinWeight = parcel.weightGrams <= limits.maxWeightGrams;
  const doesEveryUnitFit = units.every((unit) => fitsCell(unit, cell));
  const packedVolume = units.reduce((sum, unit) => sum + volumeOf(unit), 0);

  return (
    isWithinWeight &&
    doesEveryUnitFit &&
    packedVolume <= cellVolume * limits.fillFactor
  );
}

function fitsCell(unit: PackageSizeCm, cell: number[]): boolean {
  const sides = sortedSides([unit.length, unit.width, unit.height]);

  return sides.every((side, index) => side <= cell[index]);
}

function sortedSides(sides: number[]): number[] {
  return [...sides].sort((a, b) => b - a);
}

function volumeOf(unit: PackageSizeCm): number {
  return unit.length * unit.width * unit.height;
}
