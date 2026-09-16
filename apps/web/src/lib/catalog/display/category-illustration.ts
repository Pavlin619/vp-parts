/**
 * How a category is shown on the catalogue page: a bundled illustration where
 * we have one, otherwise a neutral tile.
 *
 * **TecDoc files no image for a category, and unlike the make logos there is
 * not even a near-miss to reject.** `AssemblyGroupFacetCount` is
 * `{assemblyGroupNodeId, assemblyGroupName, assemblyGroupType, parentNodeId,
 * children, count, sortNo}` — no document id, no URL — and every image type in
 * the schema belongs to an article, a data supplier or a vehicle. So category
 * illustrations are ours to ship.
 *
 * The set is bounded at 36: that is the whole passenger-car root list
 * catalogue-wide, and root node ids are global and stable, so 36 files cover
 * every car we will ever sell. Only roots are illustrated — level 2 is 490
 * nodes and rising — and every level below them renders as text.
 */

const ILLUSTRATION_DIRECTORY = "/category-illustrations";

/**
 * TecDoc `assemblyGroupNodeId` → file under `public${ILLUSTRATION_DIRECTORY}`.
 * Keyed on the id and not the name because names are not unique in the tree —
 * `филтър купе` is two different nodes under two different parents — while the
 * id is stable across trees and languages.
 *
 * All 36 are registered. The images are generated rather than sourced, so no
 * third-party licence travels with them and there is nothing to attribute;
 * `README.md` beside the files records where they came from.
 *
 * The map is explicit rather than derived from the filename so a missing asset
 * cannot cost a 404 per tile; `category-illustration.spec.ts` fails if an entry
 * names a file that is not there.
 */
export const CATEGORY_ILLUSTRATION_FILES: Record<string, string> = {
  100001: "bodywork.webp", // каросерия
  100002: "engine.webp", // двигател
  100005: "filters.webp", // филтър
  100016: "belt-drive.webp", // ремъчно задвижване
  100214: "fuel-supply.webp", // горивопроводна система
  100254: "fuel-mixture.webp", // гориво-смесителна с-ма
  100004: "exhaust.webp", // изпускателна система
  100007: "cooling.webp", // охлаждане
  100050: "clutch.webp", // съединител/монтажни части
  100238: "transmission.webp", // трансмисия
  100014: "wheel-drive.webp", // задвижване на колелата
  100400: "axel-drive.webp", // задвижване на оста
  100006: "brakes-system.webp", // спирачна уредба
  100011: "springs-dampers.webp", // пружини/амортисьори (окачване)
  100013: "suspension.webp", // окачване и управление
  100012: "steering.webp", // кормилно управление
  100010: "electrics.webp", // електрическа система
  100008: "ignition.webp", // запалителна/-подгревна система
  100241: "heating-ventilation.webp", // отопление/вентилация
  100243: "air-conditioning.webp", // климатична уредба
  100019: "service-parts.webp", // части за сервиз/инспекция/обслужване
  100015: "tow-bar.webp", // теглич/монтажни части
  100343: "load-carriers.webp", // устройства за превоз на товари
  100342: "headlight-cleaning.webp", // почистване на фаровете
  100018: "wipers.webp", // стъклопочистване
  100335: "comfort-system.webp", // система комфорт
  100339: "infotainment.webp", // информационна/комуникационна система
  100341: "interior.webp", // вътрешно обурудване
  100417: "safety.webp", // система за сигурност
  100685: "locking.webp", // заключваща система
  100733: "accessories.webp", // принадлежности
  103099: "wheels-tyres.webp", // колела/гуми
  103168: "pneumatics.webp", // пневматична система
  103202: "pto-gearbox.webp", // задвижваща кутия на прикачна техника
  706209: "hybrid-drive.webp", // хибридно/електрическо задвижване
  706365: "special-tools.webp", // специализиран инструмент
};

export function categoryIllustrationSrc(
  assemblyGroupNodeId: string,
): string | null {
  const file = CATEGORY_ILLUSTRATION_FILES[assemblyGroupNodeId];

  return file ? `${ILLUSTRATION_DIRECTORY}/${file}` : null;
}
