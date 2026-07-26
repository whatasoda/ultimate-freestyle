import {
  AssetRepositoryError,
  listProjectAssets
} from "../assets/repository";
import {
  AssetServiceError,
  readProjectImage,
  removeProjectImage,
  uploadProjectImage
} from "../assets/service";
import { readAuthConfig } from "../auth/config";
import { externalAuthorizationPage, messagePage } from "../auth/pages";
import { recordAuditEvent } from "../auth/repository";
import { secureTokenEqual } from "../auth/security";
import { storeTwitchState, webTwitchState } from "../auth/twitch-state";
import { TwitchClient, type Fetcher } from "../auth/twitch";
import {
  deleteWebSession,
  clearWebSessionCookies,
  readWebSession
} from "../auth/web-session";
import { readUrlEncodedFormCapped } from "../lib/http";
import { getProject, listProjects } from "../projects/repository";
import { dashboardScriptResponse } from "./assets";
import {
  dashboardPage,
  landingPage,
  projectDetailPage,
  projectNotFoundPage,
  redirectPage
} from "./pages";

const MAX_FORM_BYTES = 16 * 1024;
const UUID_PATH =
  "([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const IMAGE_CLIENT_ERROR_CODES = new Set([
  "IMAGE_TYPE_UNSUPPORTED",
  "IMAGE_ANIMATED_UNSUPPORTED",
  "IMAGE_INVALID",
  "IMAGE_DIMENSIONS_TOO_LARGE",
  "IMAGE_OUTPUT_TOO_LARGE",
  "IMAGE_EMPTY"
]);

async function recordWebAudit(
  db: D1Database,
  event: Parameters<typeof recordAuditEvent>[1]
): Promise<void> {
  try {
    await recordAuditEvent(db, event);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Web audit event could not be stored",
        event_type: event.eventType,
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function jsonResponse(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function assetErrorResponse(error: unknown): Response {
  if (
    error instanceof AssetServiceError ||
    error instanceof AssetRepositoryError
  ) {
    const status =
      error.code === "IMAGE_INPUT_TOO_LARGE"
        ? 413
        : IMAGE_CLIENT_ERROR_CODES.has(error.code)
          ? 422
          : 409;
    return jsonResponse(
      {
        ok: false,
        error: { code: error.code, message: error.message },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
  throw error;
}

async function requireWebSessionAndCsrf(request: Request, env: Env) {
  const session = await readWebSession(request, env.DB);
  if (session === null) return null;
  const provided = request.headers.get("x-csrf-token");
  return provided !== null &&
    (await secureTokenEqual(provided, session.csrfToken))
    ? session
    : null;
}

async function handleWebLogin(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  if ((await readWebSession(request, env.DB)) !== null) {
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
  const session = await readWebSession(request, env.DB);
  if (session === null) {
    return redirectPage("/", clearWebSessionCookies());
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
  const session = await readWebSession(request, env.DB);
  if (session === null) {
    return redirectPage("/", clearWebSessionCookies());
  }
  const project = await getProject(env.DB, session.userId, projectId);
  if (project === null) {
    return projectNotFoundPage();
  }
  return projectDetailPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    assets: await listProjectAssets(env.DB, session.userId, projectId)
  });
}

async function handleImageUpload(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" },
        request_id: crypto.randomUUID()
      },
      403
    );
  }
  if ((await getProject(env.DB, session.userId, projectId)) === null) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "PROJECT_NOT_FOUND", message: "研究が見つかりません。" },
        request_id: crypto.randomUUID()
      },
      404
    );
  }
  const url = new URL(request.url);
  try {
    const asset = await uploadProjectImage(request, env, {
      ownerUserId: session.userId,
      projectId,
      filename: url.searchParams.get("filename"),
      altText: (url.searchParams.get("alt") ?? "").slice(0, 500)
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project_image.uploaded",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        asset_id: asset.asset_id,
        byte_size: asset.byte_size
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse(
      { ok: true, asset, error: null, request_id: crypto.randomUUID() },
      201
    );
  } catch (error) {
    return assetErrorResponse(error);
  }
}

async function handleImageContent(
  request: Request,
  env: Env,
  assetId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  const found = await readProjectImage(env, session.userId, assetId);
  if (found === null) return new Response(null, { status: 404 });
  const headers = new Headers({
    "cache-control": "private, max-age=3600",
    "content-type": "image/webp",
    etag: found.object.httpEtag,
    "x-content-type-options": "nosniff"
  });
  return new Response(found.object.body, { headers });
}

async function handleImageDelete(
  request: Request,
  env: Env,
  assetId: string
): Promise<Response> {
  if (request.method !== "DELETE") {
    return new Response(null, { status: 405, headers: { allow: "DELETE" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" },
        request_id: crypto.randomUUID()
      },
      403
    );
  }
  const deleted = await removeProjectImage(env, session.userId, assetId);
  await recordWebAudit(env.DB, {
    userId: session.userId,
    eventType: "project_image.deleted",
    outcome: "succeeded",
    details: { asset_id: assetId, deleted },
    createdAt: new Date().toISOString()
  });
  return deleted
    ? jsonResponse({ ok: true, error: null, request_id: crypto.randomUUID() })
    : jsonResponse(
        {
          ok: false,
          error: { code: "ASSET_NOT_FOUND", message: "画像が見つかりません。" },
          request_id: crypto.randomUUID()
        },
        404
      );
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) {
    return redirectPage("/", clearWebSessionCookies());
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
  await deleteWebSession(request, env.DB);
  return redirectPage("/", clearWebSessionCookies());
}

export async function handleWebRequest(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/assets/dashboard.js" && request.method === "GET") {
    return dashboardScriptResponse();
  }
  if (path === "/" && request.method === "GET") {
    const session = await readWebSession(request, env.DB);
    return session === null ? landingPage() : redirectPage("/dashboard");
  }
  if (path === "/login") {
    return handleWebLogin(request, env, fetcher);
  }
  if (path === "/dashboard") {
    return handleDashboard(request, env);
  }
  const projectMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}$`, "i")
  );
  if (projectMatch?.[1] !== undefined) {
    return handleProjectDetail(request, env, projectMatch[1]);
  }
  const projectImageMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/images$`, "i")
  );
  if (projectImageMatch?.[1] !== undefined) {
    return handleImageUpload(request, env, projectImageMatch[1]);
  }
  const mediaMatch = path.match(new RegExp(`^/media/${UUID_PATH}$`, "i"));
  if (mediaMatch?.[1] !== undefined) {
    return handleImageContent(request, env, mediaMatch[1]);
  }
  const imageMatch = path.match(new RegExp(`^/api/images/${UUID_PATH}$`, "i"));
  if (imageMatch?.[1] !== undefined) {
    return handleImageDelete(request, env, imageMatch[1]);
  }
  if (path === "/logout") {
    return handleLogout(request, env);
  }
  return null;
}
