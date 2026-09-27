import nara from "../assets/character/nara/portrait.png";
import naraSource from "../assets/character/nara/source.png";
import orin from "../assets/character/orin/portrait.png";
import orinSource from "../assets/character/orin/source.png";
import ivo from "../assets/character/ivo/portrait.png";
import ivoSource from "../assets/character/ivo/source.png";
import sena from "../assets/character/sena/portrait.png";
import senaSource from "../assets/character/sena/source.png";
import type { StaticImageData } from "next/image";

/** Next emits metadata objects; browser test bundlers may emit URL strings. */
export function assetUrl(image: StaticImageData | string) {
  return typeof image === "string" ? image : image.src;
}

export const portraitUrl = assetUrl;

/** Browser artwork only; gameplay definitions and snapshots never import this catalog. */
export const CHARACTER_ART = {
  nara: { portrait: nara, source: naraSource },
  orin: { portrait: orin, source: orinSource },
  ivo: { portrait: ivo, source: ivoSource },
  sena: { portrait: sena, source: senaSource },
};

export function resolveCharacterArt(character: string) {
  return Object.hasOwn(CHARACTER_ART, character)
    ? CHARACTER_ART[character as keyof typeof CHARACTER_ART]
    : undefined;
}
