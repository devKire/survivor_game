import { requirePageUser } from "../../server/hub";
import { progress } from "../../server/progress";
import { migrateSave } from "../../game/core/save";
import ProfileSettings from "./ProfileSettings";
export const dynamic = "force-dynamic";
export default async function Page(){
 const user=await requirePageUser("/account"), row=await progress(user.id);
 return <main className="account-shell profile-page"><span className="eyebrow">SEU ECO</span><h1>Perfil e conta</h1><p>{user.displayUsername||user.username||user.name}</p><p>{user.email}</p><ProfileSettings progress={migrateSave(row.data)} importPending={!row.importResolved}/></main>;
}
