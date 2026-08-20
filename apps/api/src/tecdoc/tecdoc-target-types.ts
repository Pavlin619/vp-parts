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
 * `linkingTargetType` as the *legacy* linkage functions define it —
 * `getArticleLinkedAllLinkingTarget4` and its siblings, whose Service Index
 * entries read: "P: Passenger car, O: Commercial vehicle, M: Motor, A: Axles,
 * K: Body type", with the note that P and O "may be combined" into `'PO'`.
 *
 * Named apart from {@link LinkageTargetType} because the letter does not
 * survive the crossing: the newer generation (`getArticles`,
 * `getLinkageTargets`) documents the same `'P'` as passenger cars, motorcycles
 * and LCVs together, and splits the narrow senses out as 'V', 'B' and 'L'.
 * Sending one set's letter to the other function is accepted in silence.
 *
 * `PassengerCar` is the deliberate scope of the applicable-vehicles section:
 * this shop sells passenger-car parts, so a commercial-vehicle linkage is not
 * an omission. Widening it is `Combined`, not a different function.
 */
export const LinkageFunctionTargetType = {
  PassengerCar: 'P',
  CommercialVehicle: 'O',
  Combined: 'PO',
} as const;

export type LinkageFunctionTargetType =
  (typeof LinkageFunctionTargetType)[keyof typeof LinkageFunctionTargetType];

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
