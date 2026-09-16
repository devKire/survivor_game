import { Project, SyntaxKind } from "ts-morph";
const p = new Project({ tsConfigFilePath: "tsconfig.json" });
const sf = p.getSourceFileOrThrow("src/game/client/browser.ts");
for (const c of sf.getClasses()) {
  if (!["Input", "UI"].includes(c.getName())) continue;
  for (const call of c.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (
      call.getExpression().getText().endsWith(".addEventListener") &&
      call.getArguments().length === 2
    )
      call.addArgument("{signal:g.abort.signal}");
  }
}
for (const s of p.getSourceFiles())
  if (s.getFilePath().includes("/src/")) s.organizeImports();
await p.save();
