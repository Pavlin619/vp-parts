import { LinkedVehicleDto } from '@vp-parts-shop/shared';

/**
 * One vehicle with the model series it belongs to. The series rides alongside
 * rather than inside the row because it is what the rows are grouped by, and
 * {@link LinkedVehicleDto} deliberately does not repeat its parent.
 *
 * The row shape a TecDoc source hands back rather than a wire contract, which
 * is why it sits here and not with the linked-vehicles parsing: the mock client
 * stands in for that source and has to answer in the same shape. Declaring it in
 * the feature folder would have this module import from a feature that already
 * imports from it.
 */
export interface LinkedVehicleWithSeries {
  seriesId: string;
  seriesName: string;
  manufacturerId: string;
  vehicle: LinkedVehicleDto;
}
