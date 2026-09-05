/**
 * How a vehicle manufacturer is shown before its name: a bundled logo where we
 * have one, otherwise its initials.
 *
 * **TecDoc files no logo for a vehicle manufacturer, and there is nowhere to
 * fetch one from.** `LinkageTargetMfrFacetCount` is `{id, name,
 * linkageTargetType, count}` and `manufacturers2Record` is `{manuId, manuName,
 * favorFlag, linkingTargetTypes}`; `includeDataSupplierLogo` exists only on
 * `getBrands`, which lists *parts* suppliers in a different id space. Matching
 * the two by name was measured and does not work: of 466 makes, 3 have a
 * same-named brand logo (BUGATTI, AMC, TESLA) and each is a coincidental
 * supplier rather than a car badge. So logos are ours to ship.
 */

const LOGO_DIRECTORY = "/vehicle-makes";

/**
 * TecDoc `mfrId` → file under `public${LOGO_DIRECTORY}`. Keyed on the id and
 * not the name because names vary in spelling and case across TecDoc's own
 * functions ("VW" is never "VOLKSWAGEN" here), while the id is stable.
 *
 * Every entry is the make's actual badge, cropped to its emblem and written at
 * tile size by `apps/api/scripts/fetch-make-photos.mjs`. Several makes share a
 * file, which is the point rather than an oversight: Ford's regional arms all
 * wear the blue oval, and Renault Trucks the Renault lozenge.
 *
 * **229 of the 286 selectable makes, including all 35 popular ones.** The 57
 * without one are 279 of the catalogue's 34,977 vehicles — 0.8% — and none has
 * more than 27. They render a wordmark, which is a designed state rather than a
 * placeholder awaiting assets: what is left over is not a marque whose logo
 * nobody filed so much as one whose name cannot be resolved to a logo safely —
 * an image search answers SILENCE with a band, INDIGO with a parking operator
 * and CMC with a broadcaster. See the script's source maps for how each
 * accepted one was verified. Three more entries (Jawa, Brammo, Praga) are makes
 * the selector does not currently offer; the script enumerates a wider scope
 * than the picker so that widening it stays one constant in the API rather than
 * also meaning a re-run here.
 *
 * The map is explicit rather than derived from the filename so a missing asset
 * cannot cost a 404 per card; `vehicle-make-mark.spec.ts` fails if an entry
 * names a file that is not there.
 */
export const VEHICLE_MAKE_LOGO_FILES: Record<string, string> = {
  2: 'alfa-romeo.webp', // ALFA ROMEO
  3: 'auto-union.webp', // AUTO UNION
  5: 'audi.webp', // AUDI
  6: 'austin.webp', // AUSTIN
  10: 'bedford.webp', // BEDFORD
  16: 'bmw.webp', // BMW
  20: 'chrysler.webp', // CHRYSLER
  21: 'citroen.webp', // CITROËN
  24: 'daf.webp', // DAF
  25: 'daihatsu.webp', // DAIHATSU
  26: 'daimler.webp', // DAIMLER
  29: 'dodge.webp', // DODGE
  35: 'fiat.webp', // FIAT
  36: 'ford.webp', // FORD
  39: 'gmc.webp', // GMC
  45: 'honda.webp', // HONDA
  52: 'innocenti.webp', // INNOCENTI
  54: 'isuzu.webp', // ISUZU
  55: 'iveco.webp', // IVECO
  56: 'jaguar.webp', // JAGUAR
  63: 'lada.webp', // LADA
  64: 'lancia.webp', // LANCIA
  69: 'man.webp', // MAN
  72: 'mazda.webp', // MAZDA
  74: 'mercedes-benz.webp', // MERCEDES-BENZ
  75: 'mg.webp', // MG
  77: 'mitsubishi.webp', // MITSUBISHI
  78: 'morris.webp', // MORRIS
  80: 'nissan.webp', // NISSAN
  81: 'nsu.webp', // NSU
  84: 'opel.webp', // OPEL
  88: 'peugeot.webp', // PEUGEOT
  92: 'porsche.webp', // PORSCHE
  93: 'renault.webp', // RENAULT
  95: 'rover.webp', // ROVER
  99: 'saab.webp', // SAAB
  104: 'seat.webp', // SEAT
  106: 'skoda.webp', // SKODA
  107: 'subaru.webp', // SUBARU
  109: 'suzuki.webp', // SUZUKI
  110: 'talbot.webp', // TALBOT
  111: 'toyota.webp', // TOYOTA
  112: 'triumph.webp', // TRIUMPH
  117: 'vauxhall.webp', // VAUXHALL
  120: 'volvo.webp', // VOLVO
  121: 'volkswagen.webp', // VW
  124: 'zastava.webp', // ZASTAVA
  132: 'avia.webp', // AVIA
  134: 'barkas.webp', // BARKAS
  136: 'borgward.webp', // BORGWARD
  138: 'chevrolet.webp', // CHEVROLET
  139: 'dacia.webp', // DACIA
  142: 'ebro.webp', // EBRO
  148: 'gaz.webp', // GAZ
  161: 'mercury.webp', // MERCURY
  171: 'santana.webp', // SANTANA
  175: 'ssangyong.webp', // SSANGYONG
  178: 'tata.webp', // TATA
  181: 'piaggio.webp', // PIAGGIO
  183: 'hyundai.webp', // HYUNDAI
  184: 'kia.webp', // KIA
  185: 'daewoo.webp', // DAEWOO
  186: 'wartburg.webp', // WARTBURG
  187: 'trabant.webp', // TRABANT
  609: 'ac.webp', // AC
  694: 'renault.webp', // RENAULT TRUCKS
  700: 'ferrari.webp', // FERRARI
  701: 'lamborghini.webp', // LAMBORGHINI
  705: 'rolls-royce.webp', // ROLLS-ROYCE
  771: 'maserati.webp', // MASERATI
  773: 'reliant.webp', // RELIANT
  774: 'pontiac.webp', // PONTIAC
  775: 'fso.webp', // FSO
  776: 'ford.webp', // FORD USA
  778: 'proton.webp', // PROTON
  788: 'bugatti.webp', // BUGATTI
  799: 'autobianchi.webp', // AUTOBIANCHI
  802: 'lotus.webp', // LOTUS
  803: 'morgan.webp', // MORGAN
  808: 'ford.webp', // FORD OTOSAN
  810: 'alpine.webp', // ALPINE
  813: 'moskvich.webp', // MOSKVICH
  815: 'bentley.webp', // BENTLEY
  816: 'buick.webp', // BUICK
  819: 'cadillac.webp', // CADILLAC
  824: 'eagle.webp', // EAGLE
  831: 'geo.webp', // GEO
  842: 'lexus.webp', // LEXUS
  850: 'plymouth.webp', // PLYMOUTH
  851: 'premier.webp', // PREMIER
  861: 'tvr.webp', // TVR
  866: 'alpina.webp', // ALPINA
  879: 'asia-motors.webp', // ASIA MOTORS
  881: 'aston-martin.webp', // ASTON MARTIN
  882: 'jeep.webp', // JEEP
  907: 'westfield.webp', // WESTFIELD
  1138: 'smart.webp', // SMART
  1139: 'zaz.webp', // ZAZ
  1141: 'oldsmobile.webp', // OLDSMOBILE
  1200: 'lincoln.webp', // LINCOLN
  1280: 'mahindra.webp', // MAHINDRA
  1360: 'aro.webp', // ARO
  1480: 'aixam.webp', // AIXAM
  1485: 'bertone.webp', // BERTONE
  1486: 'bitter.webp', // BITTER
  1487: 'bristol.webp', // BRISTOL
  1488: 'callaway.webp', // CALLAWAY
  1490: 'caterham.webp', // CATERHAM
  1491: 'checker.webp', // CHECKER
  1494: 'de-lorean.webp', // DE LOREAN
  1495: 'de-tomaso.webp', // DE TOMASO
  1496: 'ford.webp', // FORD AUSTRALIA
  1498: 'ginetta.webp', // GINETTA
  1499: 'hindustan-motors.webp', // HINDUSTAN
  1505: 'acura.webp', // ACURA
  1506: 'hummer.webp', // HUMMER
  1508: 'irmscher.webp', // IRMSCHER
  1509: 'isdera.webp', // ISDERA
  1511: 'jensen.webp', // JENSEN
  1513: 'ligier.webp', // LIGIER
  1516: 'marcos.webp', // MARCOS
  1518: 'mclaren.webp', // MCLAREN
  1520: 'metrocab.webp', // METROCAB
  1522: 'minelli.webp', // MINELLI
  1523: 'mini.webp', // MINI
  1526: 'infiniti.webp', // INFINITI
  1527: 'oltcit.webp', // OLTCIT
  1529: 'osca.webp', // OSCA
  1530: 'panoz.webp', // PANOZ
  1536: 'rayton-fissore.webp', // RAYTON FISSORE
  1538: 'austin-healey.webp', // AUSTIN-HEALEY
  1539: 'riley.webp', // RILEY
  1547: 'shelby.webp', // SHELBY
  1549: 'spectre.webp', // SPECTRE
  1551: 'tofas.webp', // TOFAS
  1553: 'uaz.webp', // UAZ
  1554: 'umm.webp', // UMM
  1555: 'vector.webp', // VECTOR
  1558: 'wiesmann.webp', // WIESMANN
  1559: 'yulon.webp', // YULON
  1580: 'puch.webp', // PUCH
  1820: 'land-rover.webp', // LAND ROVER
  2164: 'maybach.webp', // MAYBACH
  2243: 'bmc.webp', // BMC
  2246: 'amc.webp', // AMC
  2589: 'landwind.webp', // LANDWIND (JMC)
  2590: 'geely.webp', // GEELY
  2755: 'spyker.webp', // SPYKER
  2760: 'ktm.webp', // KTM
  2816: 'yugo.webp', // YUGO
  2852: 'changan.webp', // CHANGAN
  2867: 'foton.webp', // FOTON
  2871: 'hongqi.webp', // HONGQI
  2873: 'jac.webp', // JAC
  2887: 'chery.webp', // CHERY
  2903: 'great-wall.webp', // GREAT WALL
  2904: 'mitsuoka.webp', // MITSUOKA
  2915: 'casalini.webp', // CASALINI
  2916: 'chatenet.webp', // CHATENET
  2932: 'zil.webp', // ZIL
  3046: 'pininfarina.webp', // PININFARINA
  3047: 'lti.webp', // LTI
  3071: 'baw.webp', // BAW
  3086: 'lifan.webp', // LIFAN
  3122: 'byd.webp', // BYD
  3196: 'gac-group.webp', // GAC
  3300: 'maxus.webp', // MAXUS
  3328: 'tesla.webp', // TESLA
  3495: 'artega.webp', // ARTEGA
  3497: 'dr.webp', // DR
  3514: 'think.webp', // THINK
  3659: 'dongfeng.webp', // DONGFENG
  3689: 'ram.webp', // RAM
  3738: 'fisker.webp', // FISKER
  3773: 'baic-motor.webp', // BAIC
  3854: 'abarth.webp', // ABARTH
  3961: 'mia-electric.webp', // MIA ELECTRIC
  3968: 'haval.webp', // HAVAL
  4015: 'streetscooter.webp', // STREETSCOOTER
  4074: 'jawa.webp', // JAWA
  4089: 'denza.webp', // DENZA
  4152: 'ruf.webp', // RUF
  4219: 'microcar.webp', // MICROCAR
  4260: 'renault-samsung.webp', // SAMSUNG
  4269: 'dfsk.webp', // DFSK
  4468: 'ds.webp', // DS
  4473: 'genesis.webp', // GENESIS
  4612: 'lynk-and-co.webp', // LYNK & CO
  4658: 'donkervoort.webp', // DONKERVOORT
  4661: 'shineray.webp', // SHINERAY
  4683: 'izh.webp', // IZH
  4751: 'wey.webp', // WEY
  4780: 'nio.webp', // NIO
  4817: 'polestar.webp', // POLESTAR
  4896: 'cupra.webp', // CUPRA
  5118: 'vinfast.webp', // VINFAST
  5123: 'ora.webp', // ORA
  5184: 'xpeng.webp', // XPENG
  5194: 'levc.webp', // LEVC
  5201: 'leapmotor.webp', // LEAPMOTOR
  5204: 'mpm-motors.webp', // MPM MOTORS
  5244: 'geometry.webp', // GEOMETRY
  5500: 'aiways.webp', // AIWAYS
  5501: 'karma.webp', // KARMA
  5510: 'bestune.webp', // BESTUNE
  5558: 'togg.webp', // TOGG
  5590: 'seres.webp', // SERES
  5705: 'e-go.webp', // E.GO
  5737: 'iso.webp', // ISO
  5738: 'bizzarrini.webp', // BIZZARRINI
  5769: 'cenntro.webp', // CENNTRO
  5890: 'skywell.webp', // SKYWELL
  6168: 'zeekr.webp', // ZEEKR
  6223: 'voyah.webp', // VOYAH
  6519: 'lucid.webp', // LUCID
  6576: 'ineos.webp', // INEOS
  6587: 'deepal.webp', // DEEPAL
  6588: 'xev.webp', // XEV
  6751: 'praga.webp', // PRAGA
  6873: 'ickx.webp', // ICKX
  6874: 'sportequipe.webp', // SPORTEQUIPE
  6915: 'rivian.webp', // RIVIAN
  7029: 'm-hero.webp', // M-HERO
  7030: 'kg-mobility.webp', // KG MOBILITY
  7535: 'rimac.webp', // RIMAC
  7642: 'omoda.webp', // OMODA
  8047: 'bac.webp', // BAC
  8059: 'jaecoo.webp', // JAECOO
  8369: 'mobilize.webp', // MOBILIZE
  8423: 'brammo.webp', // BRAMMO
  8454: 'firefly.webp', // FIREFLY
  8622: 'aion.webp', // AION
};

export function vehicleMakeLogoSrc(manufacturerId: string): string | null {
  const file = VEHICLE_MAKE_LOGO_FILES[manufacturerId];

  return file ? `${LOGO_DIRECTORY}/${file}` : null;
}