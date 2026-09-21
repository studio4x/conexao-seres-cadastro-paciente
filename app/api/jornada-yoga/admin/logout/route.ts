import { expiredAdminSessionCookie } from "../../../../../lib/jornada-admin-auth";
import { noStoreJson } from "../../../../../lib/jornada-admin-server";
export const runtime="edge";
export async function POST(){const response=noStoreJson({success:true});response.headers.set("Set-Cookie",expiredAdminSessionCookie());return response;}
