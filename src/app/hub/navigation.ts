export const navigation = [
  { id: "play", label: "Jogar", items: [
    { label: "Solo online", href: "/solo", description: "Expedição solo com progresso salvo na sua conta." },
    { label: "Equipe online", href: "/team", description: "Forme sua equipe. Até cinco ecos, uma travessia." },
    { label: "Jogar offline", href: "/offline", description: "Jogue localmente neste navegador.", public: true },
  ] },
  { id: "progress", label: "Progressão", items: [
    { label: "Obelisco", href: "/obelisk", description: "Desenvolva os caminhos que permanecem." },
    { label: "Conquistas", href: "/account#achievements", description: "Feitos e descobertas das expedições online." },
  ] },
  { id: "collection", label: "Coleção", items: [
    { label: "Coleção", href: "/collection", description: "Sua identidade através da névoa." },
    { label: "Loja", href: "/shop", description: "Aparências e efeitos, sem poder competitivo." },
    { label: "Ecos do Limiar", href: "/echoes", description: "Invoque ecos e descubra novos cosméticos." },
  ] },
  { id: "competitive", label: "Competitivo", items: [
    { label: "Arena", href: "/arena", description: "Duelos casuais e ranked com atributos normalizados." },
    { label: "Guerra do Limiar", href: "/arena?mode=war", description: "Guerra 5v5 · três rotas, uma base para defender." },
    { label: "Ranked", href: "/ranked", description: "Classificação, temporadas e recompensas." },
  ] },
  { id: "social", label: "Social", items: [
    { label: "Amigos", href: "/team#friends", description: "Encontre seus aliados e converse." },
    { label: "Minha equipe", href: "/team", description: "Convites, preparação e lobby da equipe." },
  ] },
] satisfies {id:string;label:string;items:{label:string;href:string;description:string;public?:boolean}[]}[];

const paths = new Set(["/", "/solo", "/team", "/offline", "/account", "/shop", "/collection", "/obelisk", "/arena", "/echoes", "/ranked"]);
/** Exact internal allowlist; never accept protocol-relative URLs or encoded paths. */
export function safeCallback(value: unknown): string {
  if (typeof value !== "string" || /[\\\u0000-\u0020]/.test(value)) return "/";
  const path = value.split(/[?#]/, 1)[0];
  return paths.has(path) ? value : "/";
}
export function loginHref(destination: string) {
  return `/login?callbackUrl=${encodeURIComponent(safeCallback(destination))}`;
}
