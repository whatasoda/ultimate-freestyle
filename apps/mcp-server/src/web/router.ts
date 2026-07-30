import {
  AssetRepositoryError,
  listProjectAssets
} from "../assets/repository";
import {
  AssetServiceError,
  readProjectImage,
  removeProjectImage,
  updateProjectImageAltText,
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
import { readJsonCapped, readUrlEncodedFormCapped } from "../lib/http";
import { renderPresentationHtml } from "../presentation/render";
import { getProject, listProjects, mutateProject } from "../projects/repository";
import { TEMPLATE_PRESET_DEFAULTS } from "../projects/mutation-tools";
import {
  animationSchema,
  coverLayoutSchema,
  loadingScreenSchema,
  narrationAppearanceSchema,
  narrationDisplaySchema,
  narrationSegmentSchema,
  presentationTemplateSchema,
  presentationAspectRatioSchema,
  projectStageSchema,
  slideRoleSchema,
  slideSceneNodeSchema,
  slideTypographySchema,
  visualPresetSchema
} from "../projects/schema";
import {
  createPresentationPreview,
  getPublicationStatus,
  PublicationError,
  publishPresentationPreview,
  readOwnerPresentationAudio,
  readOwnerPreview,
  readOwnerPresentationAsset,
  readPublishedPresentationAudio,
  readPublishedPresentation,
  readPublishedPresentationAsset
} from "../publications/service";
import {
  createVoiceGenerationJob,
  getVoiceGenerationJob,
  getVoiceProjectStatus,
  hydrateProjectVoice,
  readOwnerVoiceArtifact,
  resolveVoiceArtifacts,
  setupVoicevoxProfile,
  VoiceGenerationError
} from "../voicevox/service";
import { z } from "zod";
import { dashboardScriptResponse } from "./assets";
import {
  dashboardPage,
  landingPage,
  projectDetailPage,
  projectNotFoundPage,
  redirectPage,
  slideWorkspacePage,
  voiceFinishPage
} from "./pages";

const MAX_FORM_BYTES = 16 * 1024;
const MAX_JSON_BYTES = 32 * 1024;
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

const projectFieldsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  stage: projectStageSchema,
  summary: z.string().max(2_000),
  question: z.string().max(2_000),
  hypothesis: z.string().max(4_000),
  method: z.string().max(20_000),
  findings: z.array(z.string().min(1).max(4_000)).max(100).optional(),
  limitations: z.array(z.string().min(1).max(4_000)).max(100).optional()
});
const imageAltRequestSchema = z.object({
  alt_text: z.string().max(500)
});

const previewRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

const deckSettingsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  aspect_ratio: presentationAspectRatioSchema,
  loading_screen: loadingScreenSchema
});

const publishRequestSchema = z.object({
  revision_id: z.string().uuid()
});

const voiceSetupRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  profile_id: z
    .string()
    .regex(/^voicevox-style-\d+$/)
    .default("voicevox-style-3")
});

const voiceProfileTuningRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  tuning: narrationSegmentSchema.shape.voice_tuning.unwrap()
});

const voiceJobRequestSchema = voiceSetupRequestSchema.extend({
  idempotency_key: z.string().uuid()
});

const slideFieldsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  title: z.string().min(1).max(120).optional(),
  duration_seconds: z.number().int().positive().max(1_200).optional(),
  tone: z.enum(["dark", "light", "signal", "quiet"]).optional(),
  template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
  enter_animation: animationSchema.nullable().optional(),
  role: slideRoleSchema.optional(),
  cover_layout: coverLayoutSchema.optional(),
  content_markdown: z.string().min(1).max(20_000).optional(),
  sidebar_markdown: z.string().max(10_000).optional()
}).refine(
  (request) =>
    Object.entries(request).some(
      ([key, value]) => key !== "expected_version" && value !== undefined
    ),
  { message: "At least one slide field is required." }
);

const slideActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("duplicate")
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("move"),
    position: z.number().int().nonnegative().max(99)
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("delete")
  })
]);

const slideTypographyRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  typography: slideTypographySchema
});
const sceneComponentRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  component: slideSceneNodeSchema
});

const templateFieldsRequestSchema = presentationTemplateSchema
  .omit({ id: true })
  .extend({
    expected_version: z.number().int().positive(),
    make_default: z.boolean().optional()
  });

const templateCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().min(1).max(80),
  visual_preset: visualPresetSchema,
  source_template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
  make_default: z.boolean()
});
const templateDeleteRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

const narrationSettingsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  display: narrationDisplaySchema,
  speaker: z.string().max(80).nullable(),
  appearance: narrationAppearanceSchema
});

const narrationSegmentRequestSchema = narrationSegmentSchema
  .pick({ text: true, speaker: true, voice_profile_id: true, voice_tuning: true })
  .required({ speaker: true, voice_profile_id: true, voice_tuning: true })
  .extend({ expected_version: z.number().int().positive() });

const narrationSegmentCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  at: z.number().int().nonnegative().max(100),
  text: z.string().trim().min(1).max(2_000)
});

const narrationSegmentDeleteRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

const slideNarrationRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  segments: z
    .array(
      z.object({
        at: z.number().int().nonnegative().max(100),
        text: z.string().trim().min(1).max(2_000)
      })
    )
    .max(101)
    .superRefine((segments, context) => {
      const seen = new Set<number>();
      for (const segment of segments) {
        if (seen.has(segment.at)) {
          context.addIssue({
            code: "custom",
            message: "Narration steps must be unique."
          });
        }
        seen.add(segment.at);
      }
    })
});

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
  const project = await getHydratedProject(env, session.userId, projectId);
  if (project === null) {
    return projectNotFoundPage();
  }
  return projectDetailPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    assets: await listProjectAssets(env.DB, session.userId, projectId),
    publication: (await getPublicationStatus(env.DB, session.userId, projectId))!
  });
}

async function getHydratedProject(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  projectId: string
) {
  const project = await getProject(env.DB, ownerUserId, projectId);
  if (project === null) return null;
  const artifacts = await resolveVoiceArtifacts(env.DB, ownerUserId, project);
  return hydrateProjectVoice(
    project,
    artifacts,
    (segment) =>
      `/api/projects/${projectId}/voice/audio/${segment.fingerprint}`
  );
}

async function handleSlideWorkspace(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) {
    return redirectPage("/", clearWebSessionCookies());
  }
  const project = await getHydratedProject(env, session.userId, projectId);
  if (project === null) return projectNotFoundPage();
  return slideWorkspacePage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    slideId,
    assets: await listProjectAssets(env.DB, session.userId, projectId)
  });
}

async function handleSlideFrame(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  const project = await getHydratedProject(env, session.userId, projectId);
  if (
    project === null ||
    project.document.deck === null ||
    !project.document.deck.slides.some((slide) => slide.id === slideId)
  ) {
    return new Response(null, { status: 404 });
  }
  const html = renderPresentationHtml(project, {
    frameAncestors: "'self'",
    editorFrame: true
  });
  return new Response(html, {
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; style-src 'nonce-saijiyu-static'; script-src 'nonce-saijiyu-static'; media-src 'self' blob:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN"
    }
  });
}

function voiceErrorResponse(error: unknown): Response {
  if (error instanceof VoiceGenerationError) {
    const status =
      error.code === "PROJECT_NOT_FOUND" || error.code === "VOICE_JOB_NOT_FOUND"
        ? 404
        : error.code === "VOICE_JOB_LIMIT" ||
            error.code === "VOICE_CHARACTER_LIMIT"
          ? 429
          : error.code === "PROJECT_VERSION_CONFLICT"
            ? 409
            : 422;
    return jsonResponse(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          current_version: error.currentVersion
        },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
  console.error(
    JSON.stringify({
      message: "VOICEVOX web request failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "音声の処理を完了できませんでした。"
      },
      request_id: crypto.randomUUID()
    },
    500
  );
}

async function handleVoicePage(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return redirectPage("/", clearWebSessionCookies());
  const [project, voice] = await Promise.all([
    getProject(env.DB, session.userId, projectId),
    getVoiceProjectStatus(env.DB, session.userId, projectId)
  ]);
  if (project === null || voice === null) return projectNotFoundPage();
  return voiceFinishPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    voice: { ...voice, ok: true }
  });
}

async function handleVoiceStatus(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" },
        request_id: crypto.randomUUID()
      },
      401
    );
  }
  const voice = await getVoiceProjectStatus(env.DB, session.userId, projectId);
  return voice === null
    ? jsonResponse(
        {
          ok: false,
          error: { code: "PROJECT_NOT_FOUND", message: "研究が見つかりません。" },
          request_id: crypto.randomUUID()
        },
        404
      )
    : jsonResponse({ ok: true, voice, error: null, request_id: crypto.randomUUID() });
}

async function handleVoiceSetup(
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = voiceSetupRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "versionを確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await setupVoicevoxProfile(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      profileId: parsed.data.profile_id
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "voicevox.profile_configured",
      outcome: "succeeded",
      details: { project_id: projectId, project_version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      version: project.version,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return voiceErrorResponse(error);
  }
}

async function handleVoiceProfileTuning(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = voiceProfileTuningRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "調声値の範囲を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const settings = document.deck?.voicevox;
        const profile = settings?.profiles.find(
          (item) => item.id === settings.default_profile_id
        );
        if (profile === undefined) {
          const error = new Error("The default VOICEVOX profile does not exist.");
          Object.assign(error, { code: "VOICE_PROFILE_NOT_FOUND" });
          throw error;
        }
        profile.tuning = parsed.data.tuning;
        for (const slide of document.deck?.slides ?? []) {
          for (const segment of slide.narration?.segments ?? []) {
            if (segment.voice_profile_id === null || segment.voice_profile_id === profile.id) {
              segment.audio_src = null;
            }
          }
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "voicevox.profile_tuning_updated",
      outcome: "succeeded",
      details: { project_id: projectId, project_version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      version: project.version,
      voice_generation_required: true,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "既定のトーンを保存できませんでした。");
  }
}

async function handleVoiceJobCreate(
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = voiceJobRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "生成条件を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const result = await createVoiceGenerationJob(env, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      idempotencyKey: parsed.data.idempotency_key
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "voicevox.generation_requested",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        job_id: result.job.job_id,
        replayed: result.replayed
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse(
      {
        ok: true,
        job: result.job,
        status_url: result.job.status_url,
        replayed: result.replayed,
        error: null,
        request_id: crypto.randomUUID()
      },
      result.replayed ? 200 : 202
    );
  } catch (error) {
    return voiceErrorResponse(error);
  }
}

async function handleVoiceJobRead(
  request: Request,
  env: Env,
  projectId: string,
  jobId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  const job = await getVoiceGenerationJob(
    env.DB,
    session.userId,
    projectId,
    jobId
  );
  return job === null
    ? jsonResponse(
        {
          ok: false,
          error: { code: "VOICE_JOB_NOT_FOUND", message: "生成jobが見つかりません。" },
          request_id: crypto.randomUUID()
        },
        404
      )
    : jsonResponse({ ok: true, job, error: null, request_id: crypto.randomUUID() });
}

function audioResponse(
  object: R2ObjectBody | null,
  cacheControl: string,
  partial: boolean
): Response {
  if (object === null) return new Response(null, { status: 404 });
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": cacheControl,
    "content-type": "audio/mpeg",
    etag: object.httpEtag,
    "x-content-type-options": "nosniff"
  });
  if (
    object.range !== undefined &&
    "offset" in object.range &&
    object.range.offset !== undefined &&
    object.range.length !== undefined
  ) {
    const length = object.range.length;
    headers.set("content-length", String(length));
    headers.set(
      "content-range",
      `bytes ${object.range.offset}-${object.range.offset + length - 1}/${object.size}`
    );
  }
  return new Response(object.body, {
    status: partial && object.range !== undefined ? 206 : 200,
    headers
  });
}

async function handleOwnerVoiceAudio(
  request: Request,
  env: Env,
  projectId: string,
  fingerprint: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  const hasRange = request.headers.has("range");
  return audioResponse(
    await readOwnerVoiceArtifact(
      env,
      session.userId,
      projectId,
      fingerprint,
      hasRange ? request.headers : undefined
    ),
    "private, max-age=31536000, immutable",
    hasRange
  );
}

async function handlePresentationAudio(
  request: Request,
  env: Env,
  revisionId: string,
  slideId: string,
  segmentAt: number
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const hasRange = request.headers.has("range");
  const published = await readPublishedPresentationAudio(
    env,
    revisionId,
    slideId,
    segmentAt,
    hasRange ? request.headers : undefined
  );
  if (published !== null) {
    return audioResponse(
      published,
      "public, max-age=31536000, immutable",
      hasRange
    );
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  return audioResponse(
    await readOwnerPresentationAudio(
      env,
      session.userId,
      revisionId,
      slideId,
      segmentAt,
      hasRange ? request.headers : undefined
    ),
    "private, no-store",
    hasRange
  );
}

async function readRequestJson(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const read = await readJsonCapped(request, MAX_JSON_BYTES);
  if (read.ok) return read;
  return {
    ok: false,
    response: jsonResponse(
      {
        ok: false,
        error: {
          code: read.reason === "over_cap" ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST",
          message:
            read.reason === "over_cap"
              ? "リクエストが大きすぎます。"
              : "JSONリクエストを読み取れませんでした。"
        },
        request_id: crypto.randomUUID()
      },
      read.reason === "over_cap" ? 413 : 400
    )
  };
}

async function handleProjectFieldsUpdate(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = projectFieldsRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_FIELDS", message: "入力内容を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const { expected_version, question, hypothesis, method, ...fields } = parsed.data;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: expected_version,
      mutate: (document) => {
        Object.assign(document, fields, {
          question: question.trim() || null,
          hypothesis: hypothesis.trim() || null,
          method: method.trim() || null
        });
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.fields_updated",
      outcome: "succeeded",
      details: { project_id: projectId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "INTERNAL_ERROR";
    const currentVersion =
      error instanceof Error && "currentVersion" in error
        ? ((error as { currentVersion?: number }).currentVersion ?? null)
        : null;
    const status = code === "PROJECT_NOT_FOUND" ? 404 : code === "PROJECT_VERSION_CONFLICT" ? 409 : 500;
    return jsonResponse(
      {
        ok: false,
        current_version: currentVersion,
        error: {
          code,
          message:
            code === "PROJECT_VERSION_CONFLICT"
              ? "別の場所で更新されました。画面を読み込み直してください。"
              : code === "PROJECT_NOT_FOUND"
                ? "研究が見つかりません。"
                : "変更を保存できませんでした。"
        },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
}

async function handleDeckSettingsUpdate(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = deckSettingsRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_PRESENTATION_SETTINGS",
          message: "発表画面の設定を確認してください。"
        },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        if (document.deck === null) {
          const error = new Error("The presentation deck does not exist.");
          Object.assign(error, { code: "DECK_REQUIRED" });
          throw error;
        }
        document.deck.aspect_ratio = parsed.data.aspect_ratio;
        document.deck.loading_screen = parsed.data.loading_screen;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.presentation_stage_updated",
      outcome: "succeeded",
      details: { project_id: projectId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(
      error,
      "発表画面の設定を保存できませんでした。"
    );
  }
}

async function handleSlideFieldsUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideFieldsRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_FIELDS", message: "スライドの入力内容を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const { expected_version, sidebar_markdown, ...fields } = parsed.data;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (
          fields.template_id !== undefined &&
          fields.template_id !== null &&
          !document.deck?.templates?.some(
            (template) => template.id === fields.template_id
          )
        ) {
          const error = new Error("The presentation template does not exist.");
          Object.assign(error, { code: "TEMPLATE_NOT_FOUND" });
          throw error;
        }
        Object.assign(slide, fields);
        if (sidebar_markdown !== undefined) {
          slide.sidebar_markdown = sidebar_markdown.trim() || null;
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_fields_updated",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "INTERNAL_ERROR";
    const currentVersion =
      error instanceof Error && "currentVersion" in error
        ? ((error as { currentVersion?: number }).currentVersion ?? null)
        : null;
    const status =
      code === "PROJECT_NOT_FOUND" ||
      code === "SLIDE_NOT_FOUND" ||
      code === "TEMPLATE_NOT_FOUND"
        ? 404
        : code === "PROJECT_VERSION_CONFLICT"
          ? 409
          : 500;
    return jsonResponse(
      {
        ok: false,
        current_version: currentVersion,
        error: {
          code,
          message:
            code === "PROJECT_VERSION_CONFLICT"
              ? "別の場所で更新されました。画面を読み込み直してください。"
              : code === "SLIDE_NOT_FOUND"
                ? "スライドが見つかりません。"
                : code === "TEMPLATE_NOT_FOUND"
                  ? "選択したtemplateが見つかりません。"
                : code === "PROJECT_NOT_FOUND"
                  ? "研究が見つかりません。"
                  : "スライドを保存できませんでした。"
        },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
}

async function handleSlideAction(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideActionRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_FIELDS", message: "スライド操作を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  let destinationSlideId = slideId;
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const deck = document.deck;
        if (deck === null) {
          const error = new Error("The presentation deck does not exist.");
          Object.assign(error, { code: "DECK_REQUIRED" });
          throw error;
        }
        const index = deck.slides.findIndex((slide) => slide.id === slideId);
        const slide = deck.slides[index];
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (parsed.data.action === "duplicate") {
          destinationSlideId = `slide-${crypto.randomUUID()}`;
          const copy = structuredClone(slide);
          copy.id = destinationSlideId;
          copy.title = `${slide.title}（複製）`.slice(0, 120);
          for (const segment of copy.narration?.segments ?? []) {
            segment.audio_src = null;
          }
          deck.slides.splice(index + 1, 0, copy);
        } else if (parsed.data.action === "move") {
          deck.slides.splice(index, 1);
          deck.slides.splice(
            Math.min(parsed.data.position, deck.slides.length),
            0,
            slide
          );
        } else {
          if (deck.slides.length === 1) {
            const error = new Error("The last slide cannot be deleted.");
            Object.assign(error, { code: "LAST_SLIDE_REQUIRED" });
            throw error;
          }
          deck.slides.splice(index, 1);
          destinationSlideId = deck.slides[Math.min(index, deck.slides.length - 1)]!.id;
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: `project.slide_${parsed.data.action}`,
      outcome: "succeeded",
      details: {
        project_id: projectId,
        slide_id: slideId,
        destination_slide_id: destinationSlideId,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: destinationSlideId,
      version: project.version,
      next_url: `/dashboard/projects/${projectId}/slides/${destinationSlideId}`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "スライドを操作できませんでした。");
  }
}

async function handleSlideTypographyUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideTypographyRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_TYPOGRAPHY", message: "文章レイアウトの入力内容を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        slide.typography = parsed.data.typography;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_typography_updated",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "文章レイアウトを保存できませんでした。");
  }
}

async function handleSceneComponentUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  componentId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = sceneComponentRequestSchema.safeParse(read.value);
  if (!parsed.success || parsed.data.component.id !== componentId) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_FIELDS", message: "componentの入力内容を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  if (parsed.data.component.kind === "image") {
    const imageAssetId = parsed.data.component.asset_id;
    const assets = await listProjectAssets(env.DB, session.userId, projectId);
    if (!assets.some((asset) => asset.asset_id === imageAssetId)) {
      return jsonResponse(
        {
          ok: false,
          error: { code: "INVALID_FIELDS", message: "この研究で利用できる画像を選んでください。" },
          request_id: crypto.randomUUID()
        },
        422
      );
    }
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (slide.composition?.mode !== "scene") {
          const error = new Error("The slide does not use a component scene.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        const index = slide.composition.nodes.findIndex((node) => node.id === componentId);
        if (index === -1) {
          const error = new Error("The component does not exist.");
          Object.assign(error, { code: "COMPONENT_NOT_FOUND" });
          throw error;
        }
        const existing = slide.composition.nodes[index]!;
        const component = parsed.data.component;
        if (existing.kind !== component.kind) {
          const error = new Error("The component kind cannot be changed here.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        switch (component.kind) {
          case "layer":
            break;
          case "stack":
            if (existing.kind === "stack") Object.assign(existing, {
              direction: component.direction,
              gap_px: component.gap_px,
              align: component.align,
              justify: component.justify,
              wrap: component.wrap
            });
            break;
          case "grid":
            if (existing.kind === "grid") Object.assign(existing, {
              columns: component.columns,
              gap_px: component.gap_px,
              align: component.align
            });
            break;
          case "hero":
            if (existing.kind === "hero") Object.assign(existing, {
              eyebrow: component.eyebrow,
              heading: component.heading,
              subtitle: component.subtitle,
              align: component.align
            });
            break;
          case "markdown":
            if (existing.kind === "markdown") existing.markdown = component.markdown;
            break;
          case "image":
            if (existing.kind === "image") Object.assign(existing, {
              asset_id: component.asset_id,
              alt_text: component.alt_text,
              caption: component.caption,
              fit: component.fit
            });
            break;
          case "shape":
            if (existing.kind === "shape") Object.assign(existing, {
              label: component.label,
              shape: component.shape
            });
            break;
          case "card":
            if (existing.kind === "card") Object.assign(existing, {
              label: component.label,
              markdown: component.markdown,
              variant: component.variant
            });
            break;
          case "metric":
            if (existing.kind === "metric") Object.assign(existing, {
              value: component.value,
              unit: component.unit,
              caption: component.caption,
              emphasis: component.emphasis
            });
            break;
          case "quote":
            if (existing.kind === "quote") Object.assign(existing, {
              quote: component.quote,
              attribution: component.attribution
            });
            break;
          case "callout":
            if (existing.kind === "callout") Object.assign(existing, {
              label: component.label,
              heading: component.heading,
              markdown: component.markdown,
              variant: component.variant
            });
            break;
          case "bar_chart":
            if (existing.kind === "bar_chart") {
              if (existing.items.length !== component.items.length || existing.items.some((item, itemIndex) => item.id !== component.items[itemIndex]?.id)) {
                const error = new Error("Chart items cannot be added or reordered here.");
                Object.assign(error, { code: "INVALID_FIELDS" });
                throw error;
              }
              existing.max_value = component.max_value;
              existing.items = existing.items.map((item, itemIndex) => ({
                ...item,
                label: component.items[itemIndex]!.label,
                value: component.items[itemIndex]!.value,
                color: component.items[itemIndex]!.color
              }));
            }
            break;
          case "timeline":
            if (existing.kind === "timeline") {
              if (existing.items.length !== component.items.length || existing.items.some((item, itemIndex) => item.id !== component.items[itemIndex]?.id)) {
                const error = new Error("Timeline items cannot be added or reordered here.");
                Object.assign(error, { code: "INVALID_FIELDS" });
                throw error;
              }
              existing.items = existing.items.map((item, itemIndex) => ({
                ...item,
                kicker: component.items[itemIndex]!.kicker,
                heading: component.items[itemIndex]!.heading,
                detail: component.items[itemIndex]!.detail
              }));
            }
            break;
          default: {
            const error = new Error("This component cannot be edited here.");
            Object.assign(error, { code: "INVALID_FIELDS" });
            throw error;
          }
        }
        existing.at = component.at;
        existing.animation = component.animation;
        existing.style = component.style;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_component_updated",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        slide_id: slideId,
        component_id: componentId,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      component_id: componentId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "componentを保存できませんでした。");
  }
}

function projectMutationErrorResponse(
  error: unknown,
  fallbackMessage: string
): Response {
  const code =
    error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : "INTERNAL_ERROR";
  const currentVersion =
    error instanceof Error && "currentVersion" in error
      ? ((error as { currentVersion?: number }).currentVersion ?? null)
      : null;
  const messages: Record<string, string> = {
    PROJECT_NOT_FOUND: "研究が見つかりません。",
    SLIDE_NOT_FOUND: "スライドが見つかりません。",
    TEMPLATE_NOT_FOUND: "templateが見つかりません。",
    TEMPLATE_EXISTS: "同じIDのtemplateがすでにあります。",
    DECK_REQUIRED: "発表スライドを先に作成してください。",
    NARRATION_NOT_FOUND: "このスライドには読み上げがありません。",
    NARRATION_SEGMENT_NOT_FOUND: "読み上げ区間が見つかりません。",
    NARRATION_SEGMENT_EXISTS: "このSTEPにはすでに読み上げ区間があります。",
    INVALID_NARRATION_STEP: "表示段階の範囲内からSTEPを選んでください。",
    VOICE_PROFILE_NOT_FOUND: "VOICEVOX profileが見つかりません。",
    COMPONENT_NOT_FOUND: "componentが見つかりません。",
    INVALID_COMPOSITION_MODE: "このスライドはcomponent sceneではありません。",
    INVALID_FIELDS: "componentの文言を確認してください。",
    LAST_SLIDE_REQUIRED: "最後の1枚は削除できません。先に別のスライドを複製または追加してください。",
    PROJECT_VERSION_CONFLICT: "別の場所で更新されました。画面を読み込み直してください。"
  };
  const status =
    code === "PROJECT_NOT_FOUND" ||
    code === "SLIDE_NOT_FOUND" ||
    code === "TEMPLATE_NOT_FOUND" ||
    code === "NARRATION_NOT_FOUND" ||
    code === "NARRATION_SEGMENT_NOT_FOUND" ||
    code === "VOICE_PROFILE_NOT_FOUND" ||
    code === "COMPONENT_NOT_FOUND"
      ? 404
      : code === "PROJECT_VERSION_CONFLICT" ||
          code === "TEMPLATE_EXISTS" ||
          code === "DECK_REQUIRED" ||
          code === "INVALID_COMPOSITION_MODE" ||
          code === "NARRATION_SEGMENT_EXISTS" ||
          code === "LAST_SLIDE_REQUIRED"
        ? 409
        : code === "INVALID_FIELDS" || code === "INVALID_NARRATION_STEP"
          ? 422
          : 500;
  return jsonResponse(
    {
      ok: false,
      current_version: currentVersion,
      error: { code, message: messages[code] ?? fallbackMessage },
      request_id: crypto.randomUUID()
    },
    status
  );
}

async function handleTemplateFieldsUpdate(
  request: Request,
  env: Env,
  projectId: string,
  templateId: string
): Promise<Response> {
  if (request.method === "DELETE") {
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
    const read = await readRequestJson(request);
    if (!read.ok) return read.response;
    const parsed = templateDeleteRequestSchema.safeParse(read.value);
    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: { code: "INVALID_TEMPLATE", message: "画面を読み込み直してください。" },
          request_id: crypto.randomUUID()
        },
        422
      );
    }
    try {
      const project = await mutateProject(env.DB, {
        ownerUserId: session.userId,
        projectId,
        expectedVersion: parsed.data.expected_version,
        mutate: (document) => {
          const deck = document.deck;
          const templates = deck?.templates ?? [];
          const index = templates.findIndex((template) => template.id === templateId);
          if (deck === null || index === -1) {
            const error = new Error("The presentation template does not exist.");
            Object.assign(error, { code: "TEMPLATE_NOT_FOUND" });
            throw error;
          }
          templates.splice(index, 1);
          if (deck.default_template_id === templateId) deck.default_template_id = null;
          for (const slide of deck.slides) {
            if (slide.template_id === templateId) slide.template_id = null;
          }
        }
      });
      await recordWebAudit(env.DB, {
        userId: session.userId,
        eventType: "project.presentation_template_deleted",
        outcome: "succeeded",
        details: { project_id: projectId, template_id: templateId, version: project.version },
        createdAt: new Date().toISOString()
      });
      return jsonResponse({
        ok: true,
        project_id: projectId,
        template_id: templateId,
        version: project.version,
        next_url: `/dashboard/projects/${projectId}`,
        error: null,
        request_id: crypto.randomUUID()
      });
    } catch (error) {
      return projectMutationErrorResponse(error, "templateを削除できませんでした。");
    }
  }
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH, DELETE" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = templateFieldsRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_TEMPLATE", message: "templateの入力内容を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const { expected_version, make_default, ...fields } = parsed.data;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: expected_version,
      mutate: (document) => {
        const template = document.deck?.templates?.find(
          (item) => item.id === templateId
        );
        if (template === undefined) {
          const error = new Error("The presentation template does not exist.");
          Object.assign(error, { code: "TEMPLATE_NOT_FOUND" });
          throw error;
        }
        Object.assign(template, fields);
        if (make_default === true) document.deck!.default_template_id = templateId;
        else if (make_default === false && document.deck!.default_template_id === templateId) {
          document.deck!.default_template_id = null;
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.presentation_template_updated",
      outcome: "succeeded",
      details: { project_id: projectId, template_id: templateId, make_default: make_default ?? null, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      template_id: templateId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "templateを保存できませんでした。");
  }
}

async function handleTemplateCreate(
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = templateCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_TEMPLATE",
          message: "template名、ID、presetを確認してください。"
        },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const deck = document.deck;
        if (deck === null) {
          const error = new Error("The presentation deck does not exist.");
          Object.assign(error, { code: "DECK_REQUIRED" });
          throw error;
        }
        deck.templates ??= [];
        if (deck.templates.some((template) => template.id === parsed.data.template_id)) {
          const error = new Error("The presentation template already exists.");
          Object.assign(error, { code: "TEMPLATE_EXISTS" });
          throw error;
        }
        const sourceTemplate = parsed.data.source_template_id === null || parsed.data.source_template_id === undefined
          ? undefined
          : deck.templates.find((template) => template.id === parsed.data.source_template_id);
        if (parsed.data.source_template_id !== null && parsed.data.source_template_id !== undefined && sourceTemplate === undefined) {
          const error = new Error("The source presentation template does not exist.");
          Object.assign(error, { code: "TEMPLATE_NOT_FOUND" });
          throw error;
        }
        const sourceFields = sourceTemplate === undefined
          ? TEMPLATE_PRESET_DEFAULTS[parsed.data.visual_preset]
          : Object.fromEntries(Object.entries(sourceTemplate).filter(([key]) => key !== "id" && key !== "name"));
        deck.templates.push(
          presentationTemplateSchema.parse({
            id: parsed.data.template_id,
            name: parsed.data.name,
            ...sourceFields
          })
        );
        if (parsed.data.make_default) {
          deck.default_template_id = parsed.data.template_id;
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.presentation_template_created",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        template_id: parsed.data.template_id,
        source_template_id: parsed.data.source_template_id ?? null,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse(
      {
        ok: true,
        project_id: projectId,
        template_id: parsed.data.template_id,
        version: project.version,
        updated_at: project.updated_at,
        error: null,
        request_id: crypto.randomUUID()
      },
      201
    );
  } catch (error) {
    return projectMutationErrorResponse(
      error,
      "templateを作成できませんでした。"
    );
  }
}

async function handleNarrationSettingsUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = narrationSettingsRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_NARRATION_SETTINGS", message: "読み上げ枠の設定を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        slide.narration = {
          display: parsed.data.display,
          speaker: parsed.data.speaker,
          appearance: parsed.data.appearance,
          segments: slide.narration?.segments ?? []
        };
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_narration_settings_updated",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "読み上げ枠を保存できませんでした。");
  }
}

async function handleNarrationSegmentUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  at: number
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = narrationSegmentRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_NARRATION_SEGMENT", message: "読み上げ区間の設定を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  let voiceGenerationRequired = false;
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (slide.narration === null) {
          const error = new Error("The slide does not have narration.");
          Object.assign(error, { code: "NARRATION_NOT_FOUND" });
          throw error;
        }
        const segment = slide.narration.segments.find((item) => item.at === at);
        if (segment === undefined) {
          const error = new Error("The narration segment does not exist.");
          Object.assign(error, { code: "NARRATION_SEGMENT_NOT_FOUND" });
          throw error;
        }
        if (
          parsed.data.voice_profile_id !== null &&
          !document.deck?.voicevox?.profiles.some(
            (profile) => profile.id === parsed.data.voice_profile_id
          )
        ) {
          const error = new Error("The VOICEVOX profile does not exist.");
          Object.assign(error, { code: "VOICE_PROFILE_NOT_FOUND" });
          throw error;
        }
        const invalidatesAudio =
          segment.text !== parsed.data.text ||
          (segment.voice_profile_id ?? null) !== parsed.data.voice_profile_id ||
          JSON.stringify(segment.voice_tuning ?? null) !==
            JSON.stringify(parsed.data.voice_tuning);
        voiceGenerationRequired = invalidatesAudio || segment.audio_src === null;
        Object.assign(segment, {
          text: parsed.data.text,
          speaker: parsed.data.speaker,
          voice_profile_id: parsed.data.voice_profile_id,
          voice_tuning: parsed.data.voice_tuning,
          audio_src: invalidatesAudio ? null : segment.audio_src
        });
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_narration_segment_updated",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, at, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      at,
      voice_generation_required: voiceGenerationRequired,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "読み上げ区間を保存できませんでした。");
  }
}

async function handleNarrationSegmentCreate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse(
      { ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() },
      403
    );
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = narrationSegmentCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_NARRATION_SEGMENT", message: "読み上げ区間のSTEPと文を確認してください。" }, request_id: crypto.randomUUID() },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const deck = document.deck;
        const slide = deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined || deck === null) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (parsed.data.at > slide.reveal_steps) {
          const error = new Error("The narration step exceeds the slide steps.");
          Object.assign(error, { code: "INVALID_NARRATION_STEP" });
          throw error;
        }
        slide.narration ??= {
          display: deck.narration_defaults?.display ?? "commentary",
          speaker: deck.narration_defaults?.speaker ?? null,
          segments: []
        };
        if (slide.narration.segments.some((segment) => segment.at === parsed.data.at)) {
          const error = new Error("The narration step already exists.");
          Object.assign(error, { code: "NARRATION_SEGMENT_EXISTS" });
          throw error;
        }
        slide.narration.segments.push({
          at: parsed.data.at,
          text: parsed.data.text,
          audio_src: null,
          speaker: null,
          voice_profile_id: null,
          voice_tuning: null
        });
        slide.narration.segments.sort((first, second) => first.at - second.at);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.narration_segment_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, at: parsed.data.at, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      at: parsed.data.at,
      version: project.version,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "読み上げ区間を追加できませんでした。");
  }
}

async function handleNarrationSegmentDelete(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  at: number
): Promise<Response> {
  if (request.method !== "DELETE") {
    return new Response(null, { status: 405, headers: { allow: "DELETE" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse(
      { ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() },
      403
    );
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = narrationSegmentDeleteRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_NARRATION_SEGMENT", message: "読み上げ区間を確認してください。" }, request_id: crypto.randomUUID() },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        const index = slide?.narration?.segments.findIndex((segment) => segment.at === at) ?? -1;
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (index === -1 || slide.narration === null) {
          const error = new Error("The narration segment does not exist.");
          Object.assign(error, { code: "NARRATION_SEGMENT_NOT_FOUND" });
          throw error;
        }
        slide.narration.segments.splice(index, 1);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.narration_segment_deleted",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, at, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      at,
      version: project.version,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "読み上げ区間を削除できませんでした。");
  }
}

async function handleSlideNarrationUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
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
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideNarrationRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_NARRATION",
          message: "読み上げ文を確認してください。"
        },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const slide = document.deck?.slides.find((item) => item.id === slideId);
        if (slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (slide.narration === null) {
          const error = new Error("The slide does not have narration.");
          Object.assign(error, { code: "NARRATION_NOT_FOUND" });
          throw error;
        }
        const updates = new Map(
          parsed.data.segments.map((segment) => [segment.at, segment.text])
        );
        const currentSteps = slide.narration.segments.map((segment) => segment.at);
        if (
          updates.size !== currentSteps.length ||
          currentSteps.some((step) => !updates.has(step))
        ) {
          const error = new Error("Narration structure changed.");
          Object.assign(error, { code: "NARRATION_STRUCTURE_CHANGED" });
          throw error;
        }
        slide.narration.segments = slide.narration.segments.map((segment) => {
          const text = updates.get(segment.at)!;
          return {
            ...segment,
            text,
            audio_src: text === segment.text ? segment.audio_src : null
          };
        });
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_narration_updated",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        slide_id: slideId,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      version: project.version,
      updated_at: project.updated_at,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "INTERNAL_ERROR";
    const currentVersion =
      error instanceof Error && "currentVersion" in error
        ? ((error as { currentVersion?: number }).currentVersion ?? null)
        : null;
    const status =
      code === "PROJECT_NOT_FOUND" ||
      code === "SLIDE_NOT_FOUND" ||
      code === "NARRATION_NOT_FOUND"
        ? 404
        : code === "PROJECT_VERSION_CONFLICT" ||
            code === "NARRATION_STRUCTURE_CHANGED"
          ? 409
          : 500;
    return jsonResponse(
      {
        ok: false,
        current_version: currentVersion,
        error: {
          code,
          message:
            code === "PROJECT_VERSION_CONFLICT" ||
            code === "NARRATION_STRUCTURE_CHANGED"
              ? "読み上げ構成が更新されました。画面を読み込み直してください。"
              : code === "NARRATION_NOT_FOUND"
                ? "このスライドには読み上げがありません。"
                : code === "SLIDE_NOT_FOUND" || code === "PROJECT_NOT_FOUND"
                  ? "スライドが見つかりません。"
                  : "読み上げ文を保存できませんでした。"
        },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
}

function publicationErrorResponse(error: unknown): Response {
  if (error instanceof PublicationError) {
    const status = error.code === "PROJECT_NOT_FOUND" || error.code === "PREVIEW_NOT_FOUND" ? 404 : 409;
    return jsonResponse(
      {
        ok: false,
        error: { code: error.code, message: error.message },
        request_id: crypto.randomUUID()
      },
      status
    );
  }
  console.error(
    JSON.stringify({
      message: "Presentation publication request failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "発表の処理を完了できませんでした。"
      },
      request_id: crypto.randomUUID()
    },
    500
  );
}

async function handlePreviewCreate(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = previewRequestSchema.safeParse(read.value);
  if (!parsed.success) return jsonResponse({ ok: false, error: { code: "INVALID_REQUEST", message: "versionを確認してください。" }, request_id: crypto.randomUUID() }, 422);
  try {
    const result = await createPresentationPreview(
      env,
      session.userId,
      projectId,
      parsed.data.expected_version
    );
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "presentation.preview_created",
      outcome: "succeeded",
      details: { project_id: projectId, revision_id: result.revision.revision_id, project_version: result.revision.project_version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      revision: result.revision,
      preview_url: `/preview/${result.revision.revision_id}`,
      error: null,
      request_id: crypto.randomUUID()
    }, 201);
  } catch (error) {
    return publicationErrorResponse(error);
  }
}

async function handlePreviewPublish(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = publishRequestSchema.safeParse(read.value);
  if (!parsed.success) return jsonResponse({ ok: false, error: { code: "INVALID_REQUEST", message: "プレビューを選び直してください。" }, request_id: crypto.randomUUID() }, 422);
  try {
    const status = await publishPresentationPreview(
      env.DB,
      session.userId,
      projectId,
      parsed.data.revision_id
    );
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "presentation.published",
      outcome: "succeeded",
      details: { project_id: projectId, revision_id: parsed.data.revision_id },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      publication: status,
      public_url: `/p/${status.slug}`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return publicationErrorResponse(error);
  }
}

async function presentationResponse(
  object: R2ObjectBody | null,
  cacheControl: string
): Promise<Response> {
  if (object === null) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "cache-control": cacheControl,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; style-src 'nonce-saijiyu-static'; script-src 'nonce-saijiyu-static'; media-src 'self' blob:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      etag: object.httpEtag,
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function presentationAssetResponse(
  object: R2ObjectBody | null,
  cacheControl: string
): Response {
  if (object === null) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "cache-control": cacheControl,
      "content-type": "image/webp",
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'"
    }
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
  if (request.method !== "DELETE" && request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH, DELETE" } });
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
  if (request.method === "PATCH") {
    const read = await readRequestJson(request);
    if (!read.ok) return read.response;
    const parsed = imageAltRequestSchema.safeParse(read.value);
    if (!parsed.success) {
      return jsonResponse(
        {
          ok: false,
          error: { code: "INVALID_FIELDS", message: "画像の説明は500字以内で入力してください。" },
          request_id: crypto.randomUUID()
        },
        422
      );
    }
    const asset = await updateProjectImageAltText(
      env,
      session.userId,
      assetId,
      parsed.data.alt_text
    );
    if (asset === null) {
      return jsonResponse(
        {
          ok: false,
          error: { code: "ASSET_NOT_FOUND", message: "画像が見つかりません。" },
          request_id: crypto.randomUUID()
        },
        404
      );
    }
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project_image.alt_text_updated",
      outcome: "succeeded",
      details: { asset_id: assetId, has_alt_text: asset.alt_text !== "" },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, asset, error: null, request_id: crypto.randomUUID() });
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
  if (path === "/" && (request.method === "GET" || request.method === "HEAD")) {
    const session = await readWebSession(request, env.DB);
    const response = session === null
      ? landingPage({
          broadcasterLogin: env.TWITCH_BROADCASTER_LOGIN,
          minFollowDays: Number(env.MIN_FOLLOW_DAYS)
        })
      : redirectPage("/dashboard");
    return request.method === "HEAD"
      ? new Response(null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        })
      : response;
  }
  if (path === "/login") {
    return handleWebLogin(request, env, fetcher);
  }
  if (path === "/dashboard") {
    return handleDashboard(request, env);
  }
  const previewPageMatch = path.match(
    new RegExp(`^/preview/${UUID_PATH}$`, "i")
  );
  if (previewPageMatch?.[1] !== undefined) {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const session = await readWebSession(request, env.DB);
    if (session === null) return redirectPage("/", clearWebSessionCookies());
    return presentationResponse(
      await readOwnerPreview(env, session.userId, previewPageMatch[1]),
      "private, no-store"
    );
  }
  const publicPageMatch = path.match(new RegExp(`^/p/${UUID_PATH}$`, "i"));
  if (publicPageMatch?.[1] !== undefined) {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    return presentationResponse(
      await readPublishedPresentation(env, publicPageMatch[1]),
      "public, max-age=60, stale-while-revalidate=300"
    );
  }
  const presentationAssetMatch = path.match(
    new RegExp(`^/presentation-assets/${UUID_PATH}/${UUID_PATH}$`, "i")
  );
  if (
    presentationAssetMatch?.[1] !== undefined &&
    presentationAssetMatch[2] !== undefined
  ) {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const published = await readPublishedPresentationAsset(
      env,
      presentationAssetMatch[1],
      presentationAssetMatch[2]
    );
    if (published !== null) {
      return presentationAssetResponse(
        published,
        "public, max-age=31536000, immutable"
      );
    }
    const session = await readWebSession(request, env.DB);
    if (session === null) return new Response(null, { status: 404 });
    return presentationAssetResponse(
      await readOwnerPresentationAsset(
        env,
        session.userId,
        presentationAssetMatch[1],
        presentationAssetMatch[2]
      ),
      "private, no-store"
    );
  }
  const presentationAudioMatch = path.match(
    new RegExp(
      `^/presentation-audio/${UUID_PATH}/([a-z0-9][a-z0-9-]{0,63})/(\\d{1,3})\\.mp3$`,
      "i"
    )
  );
  if (
    presentationAudioMatch?.[1] !== undefined &&
    presentationAudioMatch[2] !== undefined &&
    presentationAudioMatch[3] !== undefined
  ) {
    return handlePresentationAudio(
      request,
      env,
      presentationAudioMatch[1],
      presentationAudioMatch[2],
      Number(presentationAudioMatch[3])
    );
  }
  const voicePageMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/voice$`, "i")
  );
  if (voicePageMatch?.[1] !== undefined) {
    return handleVoicePage(request, env, voicePageMatch[1]);
  }
  const projectMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}$`, "i")
  );
  if (projectMatch?.[1] !== undefined) {
    return handleProjectDetail(request, env, projectMatch[1]);
  }
  const slideFrameMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/frame$`)
  );
  if (slideFrameMatch?.[1] !== undefined && slideFrameMatch[2] !== undefined) {
    return handleSlideFrame(request, env, slideFrameMatch[1], slideFrameMatch[2]);
  }
  const slideWorkspaceMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})$`)
  );
  if (
    slideWorkspaceMatch?.[1] !== undefined &&
    slideWorkspaceMatch[2] !== undefined
  ) {
    return handleSlideWorkspace(
      request,
      env,
      slideWorkspaceMatch[1],
      slideWorkspaceMatch[2]
    );
  }
  const projectImageMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/images$`, "i")
  );
  if (projectImageMatch?.[1] !== undefined) {
    return handleImageUpload(request, env, projectImageMatch[1]);
  }
  const ownerVoiceAudioMatch = path.match(
    new RegExp(
      `^/api/projects/${UUID_PATH}/voice/audio/([0-9a-f]{64})$`,
      "i"
    )
  );
  if (
    ownerVoiceAudioMatch?.[1] !== undefined &&
    ownerVoiceAudioMatch[2] !== undefined
  ) {
    return handleOwnerVoiceAudio(
      request,
      env,
      ownerVoiceAudioMatch[1],
      ownerVoiceAudioMatch[2]
    );
  }
  const voiceJobReadMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/voice/jobs/${UUID_PATH}$`, "i")
  );
  if (
    voiceJobReadMatch?.[1] !== undefined &&
    voiceJobReadMatch[2] !== undefined
  ) {
    return handleVoiceJobRead(
      request,
      env,
      voiceJobReadMatch[1],
      voiceJobReadMatch[2]
    );
  }
  const voiceJobsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/voice/jobs$`, "i")
  );
  if (voiceJobsMatch?.[1] !== undefined) {
    return handleVoiceJobCreate(request, env, voiceJobsMatch[1]);
  }
  const voiceSetupMatch = path.match(
    new RegExp(
      `^/api/projects/${UUID_PATH}/voice/(?:profile|setup-zundamon)$`,
      "i"
    )
  );
  if (voiceSetupMatch?.[1] !== undefined) {
    return handleVoiceSetup(request, env, voiceSetupMatch[1]);
  }
  const voiceProfileTuningMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/voice/profile/tuning$`, "i")
  );
  if (voiceProfileTuningMatch?.[1] !== undefined) {
    return handleVoiceProfileTuning(request, env, voiceProfileTuningMatch[1]);
  }
  const voiceStatusMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/voice$`, "i")
  );
  if (voiceStatusMatch?.[1] !== undefined) {
    return handleVoiceStatus(request, env, voiceStatusMatch[1]);
  }
  const projectFieldsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/fields$`, "i")
  );
  if (projectFieldsMatch?.[1] !== undefined) {
    return handleProjectFieldsUpdate(request, env, projectFieldsMatch[1]);
  }
  const deckSettingsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/presentation/settings$`, "i")
  );
  if (deckSettingsMatch?.[1] !== undefined) {
    return handleDeckSettingsUpdate(request, env, deckSettingsMatch[1]);
  }
  const slideTypographyMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/typography$`)
  );
  if (
    slideTypographyMatch?.[1] !== undefined &&
    slideTypographyMatch[2] !== undefined
  ) {
    return handleSlideTypographyUpdate(
      request,
      env,
      slideTypographyMatch[1],
      slideTypographyMatch[2]
    );
  }
  const slideActionMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/actions$`)
  );
  if (slideActionMatch?.[1] !== undefined && slideActionMatch[2] !== undefined) {
    return handleSlideAction(
      request,
      env,
      slideActionMatch[1],
      slideActionMatch[2]
    );
  }
  const sceneComponentMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/components/([a-z0-9][a-z0-9-]{0,63})$`)
  );
  if (
    sceneComponentMatch?.[1] !== undefined &&
    sceneComponentMatch[2] !== undefined &&
    sceneComponentMatch[3] !== undefined
  ) {
    return handleSceneComponentUpdate(
      request,
      env,
      sceneComponentMatch[1],
      sceneComponentMatch[2],
      sceneComponentMatch[3]
    );
  }
  const slideFieldsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})$`)
  );
  if (slideFieldsMatch?.[1] !== undefined && slideFieldsMatch[2] !== undefined) {
    return handleSlideFieldsUpdate(
      request,
      env,
      slideFieldsMatch[1],
      slideFieldsMatch[2]
    );
  }
  const templateFieldsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/templates/([a-z0-9][a-z0-9-]{0,63})$`)
  );
  if (
    templateFieldsMatch?.[1] !== undefined &&
    templateFieldsMatch[2] !== undefined
  ) {
    return handleTemplateFieldsUpdate(
      request,
      env,
      templateFieldsMatch[1],
      templateFieldsMatch[2]
    );
  }
  const templateCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/templates$`, "i")
  );
  if (templateCreateMatch?.[1] !== undefined) {
    return handleTemplateCreate(request, env, templateCreateMatch[1]);
  }
  const narrationSettingsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/narration/settings$`)
  );
  if (
    narrationSettingsMatch?.[1] !== undefined &&
    narrationSettingsMatch[2] !== undefined
  ) {
    return handleNarrationSettingsUpdate(
      request,
      env,
      narrationSettingsMatch[1],
      narrationSettingsMatch[2]
    );
  }
  const narrationSegmentMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/narration/segments/(\\d{1,3})$`)
  );
  if (
    narrationSegmentMatch?.[1] !== undefined &&
    narrationSegmentMatch[2] !== undefined &&
    narrationSegmentMatch[3] !== undefined
  ) {
    return request.method === "DELETE"
      ? handleNarrationSegmentDelete(
          request,
          env,
          narrationSegmentMatch[1],
          narrationSegmentMatch[2],
          Number(narrationSegmentMatch[3])
        )
      : handleNarrationSegmentUpdate(
          request,
          env,
          narrationSegmentMatch[1],
          narrationSegmentMatch[2],
          Number(narrationSegmentMatch[3])
        );
  }
  const narrationSegmentsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/narration/segments$`)
  );
  if (
    narrationSegmentsMatch?.[1] !== undefined &&
    narrationSegmentsMatch[2] !== undefined
  ) {
    return handleNarrationSegmentCreate(
      request,
      env,
      narrationSegmentsMatch[1],
      narrationSegmentsMatch[2]
    );
  }
  const slideNarrationMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/narration$`)
  );
  if (
    slideNarrationMatch?.[1] !== undefined &&
    slideNarrationMatch[2] !== undefined
  ) {
    return handleSlideNarrationUpdate(
      request,
      env,
      slideNarrationMatch[1],
      slideNarrationMatch[2]
    );
  }
  const projectPreviewMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/previews$`, "i")
  );
  if (projectPreviewMatch?.[1] !== undefined) {
    return handlePreviewCreate(request, env, projectPreviewMatch[1]);
  }
  const projectPublishMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/publish$`, "i")
  );
  if (projectPublishMatch?.[1] !== undefined) {
    return handlePreviewPublish(request, env, projectPublishMatch[1]);
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
