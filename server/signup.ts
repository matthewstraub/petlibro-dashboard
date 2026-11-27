import { hasAnyUser } from "./db";

/**
 * Whether this site lets someone create a new account.
 *
 * Each site is one household's fountain, so sign-up stays open only until the
 * first account exists. Left open, anyone who found the URL could register,
 * and the scheduled sync would then sync whatever Petlibro login they saved,
 * on this site's Render hours and database.
 *
 * To let someone else register later, set ALLOW_SIGNUP=true on the deployment
 * and remove it again once they have. It's read on every request, so a restart
 * picks it up without a rebuild.
 */
export async function isSignupOpen(): Promise<boolean> {
  if (/^(1|true|yes)$/i.test((process.env.ALLOW_SIGNUP ?? "").trim()))
    return true;
  return !(await hasAnyUser());
}
