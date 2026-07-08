import { renderHook } from "@testing-library/react";
import { useFitVehicleName } from "./use-fit-vehicle-name";
import { useVehicleContext, type SelectedVehicle } from "./use-vehicle-context";

const vehicle: SelectedVehicle = {
  vehicleId: "v1",
  manufacturerId: "m1",
  seriesId: "s1",
  manufacturerName: "AUDI",
  seriesName: "A3",
  variantName: "2.0 TDI",
  engine: "2.0 TDI",
  powerKw: 110,
  yearFrom: 2012,
  yearTo: null,
};

describe("useFitVehicleName", () => {
  afterEach(() => {
    useVehicleContext.setState({ selectedVehicle: null });
  });

  it("prefers an explicit vehicle name", () => {
    useVehicleContext.setState({ selectedVehicle: vehicle });
    const { result } = renderHook(() => useFitVehicleName("BMW 320d"));

    expect(result.current).toBe("BMW 320d");
  });

  it("derives the name from the vehicle context when none is passed", () => {
    useVehicleContext.setState({ selectedVehicle: vehicle });
    const { result } = renderHook(() => useFitVehicleName());

    expect(result.current).toBe("AUDI A3 · 2.0 TDI");
  });

  it("returns undefined when no vehicle is selected", () => {
    const { result } = renderHook(() => useFitVehicleName());

    expect(result.current).toBeUndefined();
  });
});
