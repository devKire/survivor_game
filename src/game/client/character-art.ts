import nara from "../assets/character/nara/portrait.png";
import orin from "../assets/character/orin/portrait.png";
import ivo from "../assets/character/ivo/portrait.png";
import sena from "../assets/character/sena/portrait.png";
import type { StaticImageData } from "next/image";

/** Next emits metadata objects; browser test bundlers may emit URL strings. */
export function portraitUrl(image: StaticImageData | string) {
  return typeof image === "string" ? image : image.src;
}

/** Browser artwork only; gameplay definitions and snapshots never import this catalog. */
export const CHARACTER_ART = {
  nara: { portrait: nara },
  orin: { portrait: orin },
  ivo: { portrait: ivo },
  sena: { portrait: sena },
};

export function resolveCharacterArt(character: string) {
  return Object.hasOwn(CHARACTER_ART, character)
    ? CHARACTER_ART[character as keyof typeof CHARACTER_ART]
    : undefined;
}
