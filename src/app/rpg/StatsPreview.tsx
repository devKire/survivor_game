import {
  COMBAT_STAT_KEYS,
  previewRpgBuild,
  type CombatStats,
  type RpgCombatLoadout,
} from "../../game/core/rpg";
import { statLabels, statValue } from "./presentation";
import styles from "./rpg.module.css";

export function StatsPreview({
  base,
  loadout,
}: {
  base: CombatStats;
  loadout: RpgCombatLoadout | null;
}) {
  if (!loadout)
    return (
      <p role="status">
        Prévia indisponível. Remova equipamentos incompatíveis para revisar esta
        build.
      </p>
    );
  const preview = previewRpgBuild(base, loadout);
  return (
    <div className={styles.tableScroll}>
      <table className={styles.stats}>
        <caption>
          Prévia RPG · nível temporário 1, sem melhorias do Obelisco ou
          passivas. Cooldown menor é mais rápido.
        </caption>
        <thead>
          <tr>
            <th>Atributo de combate</th>
            <th>Base</th>
            <th>Com atributos</th>
            <th>Com equipamentos</th>
          </tr>
        </thead>
        <tbody>
          {COMBAT_STAT_KEYS.map((key) => (
            <tr key={key}>
              <th scope="row">{statLabels[key]}</th>
              <td>{statValue(key, base[key])}</td>
              <td>{statValue(key, preview.attributesOnly[key])}</td>
              <td>{statValue(key, preview.effective[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
