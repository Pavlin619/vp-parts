import { AssemblyGroupType, LinkageTargetType } from './tecdoc-target-types';

// The codes are the wire contract. An unrecognised letter is refused outright
// (`400 Field 'linkingTargetType' has an invalid value:XY`), so a typo cannot
// slip through — but a *recognised* wrong letter is accepted in silence and
// answers a different set, which is the failure worth pinning against.
describe('LinkageTargetType', () => {
  it('exposes the linkage target families TecDoc documents', () => {
    expect(LinkageTargetType.Vehicle).toBe('P');
    expect(LinkageTargetType.CommercialVehicle).toBe('O');
    expect(LinkageTargetType.Engine).toBe('M');
    expect(LinkageTargetType.Axle).toBe('A');
    expect(LinkageTargetType.Universal).toBe('U');
  });

  it('splits the Vehicle union into the narrow codes it covers', () => {
    expect(LinkageTargetType.PassengerCar).toBe('V');
    expect(LinkageTargetType.Lcv).toBe('L');
    expect(LinkageTargetType.Motorcycle).toBe('B');
  });

  // `getLinkageTargets` unions concatenated codes, so this is one call and not
  // two merged: 'VL' answers 286 makes against 257 for 'V' and 92 for 'L'.
  // `getArticles` refuses the same value, which is why nothing pairing a
  // linkage type with a `linkageTargetId` may use it.
  it('composes the selector scope out of those two letters', () => {
    expect(LinkageTargetType.CarAndLcv).toBe(
      `${LinkageTargetType.PassengerCar}${LinkageTargetType.Lcv}`,
    );
  });
});

describe('AssemblyGroupType', () => {
  it('exposes the assembly group trees TecDoc documents', () => {
    expect(AssemblyGroupType.PassengerCar).toBe('P');
    expect(AssemblyGroupType.Motorcycle).toBe('B');
    expect(AssemblyGroupType.CommercialVehicle).toBe('O');
    expect(AssemblyGroupType.Engine).toBe('M');
    expect(AssemblyGroupType.Axle).toBe('A');
    expect(AssemblyGroupType.Universal).toBe('U');
  });

  // Why the two are separate types rather than one shared list: 'P' does not
  // mean the same thing in each. As an assembly-group tree it is passenger cars
  // alone; as a linkage target it is cars, motorcycles and LCVs together, and
  // the narrow sense is 'V'. Passing one where the other belongs is accepted in
  // silence and quietly answers the wrong set.
  it('shares the letter P with the linkage targets but not its meaning', () => {
    expect(AssemblyGroupType.PassengerCar).toBe(LinkageTargetType.Vehicle);
    expect(AssemblyGroupType.PassengerCar).not.toBe(
      LinkageTargetType.PassengerCar,
    );
  });
});
