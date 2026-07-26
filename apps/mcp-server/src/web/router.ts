import { readAuthConfig } from "../auth/config";
import { externalAuthorizationPage, messagePage } from "../auth/pages";
import {
  WEB_SESSION_COOKIE,
  clearSecureCookie,
  secureTokenEqual
} from "../auth/security";
import {
  storeTwitchState,
  webTwitchState
} from "../auth/twitch-state";
import { TwitchClient, type Fetcher } from "../auth/twitch";
import {
  deleteWebSession,
  readWebSession
} from "../auth/web-session";
import { getProject, listProjects } from "../projects/repository";
import { readUrlEncodedFormCapped } from "../lib/http";
import {
  dashboardPage,
  landingPage,
  projectDetailPage,
  projectNotFoundPage,
  redirectPage
} from "./pages";

const MAX_FORM_BYTES = 16 * 1024;

async function handleWebLogin(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  if ((await readWebSession(request, env.AUTH_STATE_KV)) !== null) {
    return redirectPage("/dashboard");
  }
  const config = readAuthConfig(env);
  const twitch = new TwitchClient(config.twitch, fetcher);
  const pending = await storeTwitchState(env, webTwitchState());
  return externalAuthorizationPage(twitch.createAuthorizationUrl(pending.state), [
    pending.cookie
  ]);
}

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.AUTH_STATE_KV);
  if (session === null) {
    return redirectPage("/", [clearSecureCookie(WEB_SESSION_COOKIE)]);
  }
  return dashboardPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    projects: await listProjects(env.DB, session.userId)
  });
}

async function handleProjectDetail(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.AUTH_STATE_KV);
  if (session === null) {
    return redirectPage("/", [clearSecureCookie(WEB_SESSION_COOKIE)]);
  }
  const project = await getProject(env.DB, session.userId, projectId);
  if (project === null) {
    return projectNotFoundPage();
  }
  return projectDetailPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await readWebSession(request, env.AUTH_STATE_KV);
  if (session === null) {
    return redirectPage("/", [clearSecureCookie(WEB_SESSION_COOKIE)]);
  }
  const form = await readUrlEncodedFormCapped(request, MAX_FORM_BYTES);
  if (!form.ok) {
    return messagePage(
      "ログアウトエラー",
      form.reason === "over_cap"
        ? "リクエストが大きすぎます。"
        : "リクエストを読み取れませんでした。",
      form.reason === "over_cap" ? 413 : 400
    );
  }
  const csrfToken = form.value.get("csrf_token");
  if (
    typeof csrfToken !== "string" ||
    !(await secureTokenEqual(csrfToken, session.csrfToken))
  ) {
    return messagePage(
      "ログアウトエラー",
      "画面の有効期限が切れました。ページを読み込み直してください。",
      403
    );
  }
  await deleteWebSession(request, env.AUTH_STATE_KV);
  return redirectPage("/", [clearSecureCookie(WEB_SESSION_COOKIE)]);
}

export async function handleWebRequest(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/" && request.method === "GET") {
    const session = await readWebSession(request, env.AUTH_STATE_KV);
    return session === null ? landingPage() : redirectPage("/dashboard");
  }
  if (path === "/login") {
    return handleWebLogin(request, env, fetcher);
  }
  if (path === "/dashboard") {
    return handleDashboard(request, env);
  }
  const projectMatch = path.match(
    /^\/dashboard\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  );
  if (projectMatch?.[1] !== undefined) {
    return handleProjectDetail(request, env, projectMatch[1]);
  }
  if (path === "/logout") {
    return handleLogout(request, env);
  }
  return null;
}
