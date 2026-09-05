/**
 * TecDoc's linkage target families — what a part can be catalogued as fitting.
 *
 * `Vehicle` ('P') is the family every catalog surface here sells for, and it is
 * a *union*: passenger cars, motorcycles and LCVs under one code. The three
 * narrow codes it covers are named below because the shop sells car and van
 * parts and not motorcycle parts, so enumerating 'P' puts KAWASAKI and a
 * HARLEY-DAVIDSON model list in a car-parts brand picker. Requests accept
 * further targets ('C', 'T', 'K', 'H', 'S') that nothing here asks for.
 *
 * **`getLinkageTargets` accepts these concatenated; `getArticles` does not.**
 * Measured live: `getLinkageTargets` answers 'VL' and 'LV' identically with the
 * union of the two (286 makes against 257 and 92 separately, so it is a real
 * union and not a silently ignored parameter), and 'VLB' with all 466 that 'P'
 * gives. `getArticles` refuses the same value —
 * `400 Field 'linkingTargetType' has an invalid value:VL` — and takes one
 * letter only. An unknown letter is refused by both, so a typo here fails loudly.
 *
 * That asymmetry is why {@link CarAndLcv} is for enumeration only, and why
 * every per-vehicle `getArticles` read stays on `Vehicle`: those pair the type
 * with a `linkageTargetId`, and TecDoc checks the pair. A car id under 'V' and
 * a van id under 'L' each answer 772 and 656 assembly-group nodes, but swap
 * them and the id itself is rejected
 * (`400 Field 'linkageTargetId' has an invalid value`). Since the selector now
 * yields both kinds of id, 'P' is the only single code that accepts either.
 */
export const LinkageTargetType = {
  Vehicle: 'P',
  PassengerCar: 'V',
  Lcv: 'L',
  Motorcycle: 'B',
  /**
   * The vehicle selector's scope: cars and vans, no motorcycles. Concatenated,
   * so `getLinkageTargets` only — see the note above.
   *
   * Cars alone ('V') is the wrong narrowing and the vans are why: it takes
   * MERCEDES-BENZ from 39 van series to zero, losing Sprinter and Vito
   * outright, and FORD from 43 to the two Transit Connect/Courier minivans.
   * Adding 'L' back costs 29 makes that are LCV-only (IVECO, RENAULT TRUCKS)
   * and keeps none of the motorcycle-only ones.
   *
   * It filters *variants* and not just makes, which is what makes it the right
   * cut rather than a make blocklist: KTM keeps its 2 X-Bow series and drops 38
   * bike series, TRIUMPH keeps 35 car series (Spitfire, TR 6, Herald) and drops
   * 21 bike series, and KAWASAKI leaves entirely.
   */
  CarAndLcv: 'VL',
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
