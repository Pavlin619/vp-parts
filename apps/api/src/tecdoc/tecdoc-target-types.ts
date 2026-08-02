/**
 * TecDoc's linkage target families — what a part can be catalogued as fitting.
 *
 * These five are the set a generic article's `linkageTargetTypes` can hold, so
 * they are what we both send and read back. Requests accept a longer list that
 * splits `Vehicle` into its parts and adds body/model-series targets ('V'
 * Passenger Car, 'L' LCV, 'B' Motorcycle, 'C', 'T', 'K', 'H', 'S'); none is
 * named here because nothing in this shop asks for them.
 *
 * `Vehicle` spans passenger cars, motorcycles and LCVs in one code, and is the
 * only family every catalog surface here sells for.
 */
export const LinkageTargetType = {
  Vehicle: 'P',
  CommercialVehicle: 'O',
  Engine: 'M',
  Axle: 'A',
  Universal: 'U',
} as const;

export type LinkageTargetType =
  (typeof LinkageTargetType)[keyof typeof LinkageTargetType];

/**
 * TecDoc's assembly-group (category tree) families. Deliberately separate from
 * {@link LinkageTargetType} despite sharing most of its letters: the sets are
 * not the same — motorcycles are their own group type but fold into `Vehicle`
 * as a linkage target — and these codes concatenate, so `'PU'` asks for the
 * passenger-car and universal trees in one call. Passing one where the other
 * belongs is silently accepted and quietly wrong, which is the whole reason
 * they are named apart.
 */
export const AssemblyGroupType = {
  PassengerCar: 'P',
  Motorcycle: 'B',
  CommercialVehicle: 'O',
  Engine: 'M',
  Axle: 'A',
  Universal: 'U',
} as const;

export type AssemblyGroupType =
  (typeof AssemblyGroupType)[keyof typeof AssemblyGroupType];
