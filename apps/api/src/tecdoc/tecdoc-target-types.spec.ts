import { AssemblyGroupType, LinkageTargetType } from './tecdoc-target-types';

// The codes are the wire contract, and TecDoc ignores a type it does not
// recognise rather than rejecting it — a wrong letter would silently widen or
// empty a result instead of failing the call, so each is pinned here.
describe('LinkageTargetType', () => {
  it('exposes the linkage target families TecDoc documents', () => {
    expect(LinkageTargetType.Vehicle).toBe('P');
    expect(LinkageTargetType.CommercialVehicle).toBe('O');
    expect(LinkageTargetType.Engine).toBe('M');
    expect(LinkageTargetType.Axle).toBe('A');
    expect(LinkageTargetType.Universal).toBe('U');
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

  // Why the two are separate types rather than one shared list: motorcycles are
  // their own category tree but fold into the Vehicle linkage target, so the
  // sets genuinely differ and swapping one for the other would be accepted.
  it('names a tree that has no linkage-target counterpart', () => {
    expect(Object.values(LinkageTargetType)).not.toContain(
      AssemblyGroupType.Motorcycle,
    );
  });
});
