export type Country = { alpha2: string; code: string };

// Motorsport-friendly three-letter codes. Germany intentionally uses GER,
// matching the codes used in race entry lists and timing systems.
const countryPairs = `
AF:AFG AL:ALB DZ:ALG AD:AND AO:ANG AG:ANT AR:ARG AM:ARM AU:AUS AT:AUT AZ:AZE
BS:BAH BH:BRN BD:BAN BB:BAR BY:BLR BE:BEL BZ:BIZ BJ:BEN BT:BHU BO:BOL
BA:BIH BW:BOT BR:BRA BN:BRU BG:BUL BF:BUR BI:BDI CV:CPV KH:CAM CM:CMR
CA:CAN CF:CAF TD:CHA CL:CHI CN:CHN CO:COL KM:COM CG:CGO CD:COD CR:CRC
CI:CIV HR:CRO CU:CUB CY:CYP CZ:CZE DK:DEN DJ:DJI DM:DMA DO:DOM EC:ECU
EG:EGY SV:ESA GQ:GEQ ER:ERI EE:EST SZ:SWZ ET:ETH FJ:FIJ FI:FIN FR:FRA
GA:GAB GM:GAM GE:GEO DE:GER GH:GHA GR:GRE GD:GRN GT:GUA GN:GUI GW:GBS
GY:GUY HT:HAI HN:HON HU:HUN IS:ISL IN:IND ID:INA IR:IRI IQ:IRQ IE:IRL
IL:ISR IT:ITA JM:JAM JP:JPN JO:JOR KZ:KAZ KE:KEN KI:KIR KP:PRK KR:KOR
KW:KUW KG:KGZ LA:LAO LV:LAT LB:LBN LS:LES LR:LBR LY:LBA LI:LIE LT:LTU
LU:LUX MG:MAD MW:MAW MY:MAS MV:MDV ML:MLI MT:MLT MH:MHL MR:MTN MU:MRI
MX:MEX FM:FSM MD:MDA MC:MON MN:MGL ME:MNE MA:MAR MZ:MOZ MM:MYA NA:NAM
NR:NRU NP:NEP NL:NED NZ:NZL NI:NCA NE:NIG NG:NGR MK:MKD NO:NOR OM:OMA
PK:PAK PW:PLW PA:PAN PG:PNG PY:PAR PE:PER PH:PHI PL:POL PT:POR QA:QAT
RO:ROU RU:RUS RW:RWA KN:SKN LC:LCA VC:VIN WS:SAM SM:SMR ST:STP SA:KSA
SN:SEN RS:SRB SC:SEY SL:SLE SG:SGP SK:SVK SI:SLO SB:SOL SO:SOM ZA:RSA
SS:SSD ES:ESP LK:SRI SD:SUD SR:SUR SE:SWE CH:SUI SY:SYR TW:TPE TJ:TJK
TZ:TAN TH:THA TL:TLS TG:TOG TO:TGA TT:TTO TN:TUN TR:TUR TM:TKM TV:TUV
UG:UGA UA:UKR AE:UAE GB:GBR US:USA UY:URU UZ:UZB VU:VAN VA:VAT VE:VEN
VN:VIE YE:YEM ZM:ZAM ZW:ZIM PS:PLE XK:KOS
`;

export const countries: Country[] = countryPairs.trim().split(/\s+/).map((pair) => {
  const [alpha2, code] = pair.split(":");
  return { alpha2, code };
});

const byCode = new Map(countries.map((country) => [country.code, country]));

export function isCountryCode(value: string) {
  return byCode.has(value.trim().toUpperCase());
}

export function countryFlag(code: string) {
  const country = byCode.get(code.trim().toUpperCase());
  if (!country) return "🏁";
  return String.fromCodePoint(...country.alpha2.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

export function localizedCountries(locale: "cs" | "en") {
  const displayNames = new Intl.DisplayNames([locale === "cs" ? "cs-CZ" : "en-GB"], { type: "region" });
  return countries
    .map((country) => ({ ...country, name: displayNames.of(country.alpha2) ?? country.code, flag: countryFlag(country.code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale === "cs" ? "cs" : "en"));
}
