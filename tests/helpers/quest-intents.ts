import { randomUUID } from "node:crypto";
import { db } from "../../src/server/db";
import {
  mutateQuest,
  mutateDialogue,
} from "../../src/server/rpg/quests/service";
import { rpgQuestJournal } from "../../src/server/rpg/quests/journal";
export async function questIntent(
  userId: string,
  kind: "ACCEPT" | "CLAIM",
  questId: string,
) {
  const revision = (
    await db().rpgProfile.findUniqueOrThrow({ where: { userId } })
  ).revision;
  return mutateQuest(userId, {
    kind,
    questId,
    expectedRevision: revision,
    requestId: randomUUID(),
  });
}
export async function dialogueIntent(
  userId: string,
  npcId: string,
  choices: string[],
) {
  const revision = async () =>
    (await db().rpgProfile.findUniqueOrThrow({ where: { userId } })).revision;
  await mutateDialogue(userId, {
    kind: "OPEN",
    npcId,
    expectedRevision: await revision(),
    requestId: randomUUID(),
  });
  for (const choiceId of choices)
    await mutateDialogue(userId, {
      kind: "CHOOSE",
      npcId,
      choiceId,
      expectedRevision: await revision(),
      requestId: randomUUID(),
    });
}
/** Test preparation through narrative intents, never inserted proofs/grants. */
export async function introduce(userId: string) {
  await rpgQuestJournal(userId);
  await questIntent(userId, "ACCEPT", "main:refuge-introduction");
  await dialogueIntent(userId, "refuge:guardian", ["priority", "remnants"]);
  await dialogueIntent(userId, "refuge:guide", ["briefing", "confirm"]);
  await dialogueIntent(userId, "refuge:guardian", ["intro-report", "confirm"]);
  await questIntent(userId, "CLAIM", "main:refuge-introduction");
}
