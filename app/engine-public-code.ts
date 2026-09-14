/**
 * Krátký veřejný identifikátor motoru — to, co je pod QR kódem na štítku.
 *
 * Proč vedle `engines.id`: do QR kódu se vejde `https://doména/m/M7K4XQ` místo adresy s UUID,
 * což je při stejné velikosti štítku výrazně hrubší mřížka. V dílně se štítek zamastí a oťuká,
 * takže hrubší kód drží čitelnost déle.
 *
 * Proč ne `engines.code`: kód motoru se dá přejmenovat a nemusí být jedinečný napříč
 * kategoriemi. Tenhle identifikátor vznikne při založení motoru a už se nemění — jinak by
 * vytištěný štítek přestal platit.
 *
 * Abeceda je Crockfordova base32: bez písmen I, L, O a U, takže se nepletou dvojice 0/O
 * a 1/I/l. Při ručním dohledání se navíc překlepy O → 0 a I/L → 1 samy opraví, protože
 * takový znak v abecedě vůbec není a `normalizePublicCode()` ho přeloží.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

/** Náhodný kód. Jedinečnost hlídá unikátní index v databázi, volající kolizi opakuje. */
export function generatePublicCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/**
 * Uklidí, co člověk opsal ze štítku: velká písmena, pryč mezery a pomlčky, záměny
 * podobných znaků na to, co v abecedě existuje.
 */
export function normalizePublicCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .slice(0, CODE_LENGTH);
}

export function isPublicCode(value: string) {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}
