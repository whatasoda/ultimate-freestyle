import {
  AssetRepositoryError,
  listProjectAssets
} from "../assets/repository";
import type { ProjectAsset } from "../assets/schema";
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
import {
  PRESENTATION_RENDERER_VERSION,
  renderPresentationHtml
} from "../presentation/render";
import {
  getProjectDraftRevision,
  getProject,
  listDashboardProjects,
  listProjectDraftRevisions,
  mutateProject,
  restoreProjectDraftRevision,
  ProjectRepositoryError
} from "../projects/repository";
import { TEMPLATE_PRESET_DEFAULTS } from "../projects/mutation-tools";
import {
  getRenderedQualityReport,
  renderedQualityReportInputSchema,
  saveRenderedQualityReport
} from "../projects/quality-reports";
import { invalidateVoiceProfileAudio } from "../projects/voice-audio";
import {
  deleteReviewComment,
  listReviewComments,
  reviewCommentCreateSchema,
  reviewCommentStatusSchema,
  setReviewCommentStatus
} from "../reviews/repository";
import {
  addSlideReviewComment,
  buildReviewRepairInstruction,
  ReviewServiceError
} from "../reviews/service";
import {
  animationSchema,
  coverLayoutSchema,
  loadingScreenSchema,
  narrationAppearanceSchema,
  narrationDisplaySchema,
  narrationSegmentSchema,
  presentationTemplateSchema,
  presentationAspectRatioSchema,
  projectSlideSchema,
  projectStageSchema,
  RESEARCH_LOG_LIMIT,
  RESEARCH_LOG_PAGE_SIZE,
  slideRoleSchema,
  slideBlockSchema,
  slideSceneNodeSchema,
  type SlideSceneNode,
  slideTypographySchema,
  visualPresetSchema
} from "../projects/schema";
import {
  createPresentationPreview,
  getPublicationStatus,
  markPresentationPreviewReviewed,
  PublicationError,
  publishPresentationPreview,
  unpublishPresentation,
  readOwnerPresentationAudio,
  readOwnerPreview,
  readOwnerPresentationAsset,
  readPublishedPresentationAudio,
  readPublishedPresentation,
  readPublishedPresentationAsset
} from "../publications/service";
import {
  createVoiceGenerationJob,
  getOrCreateVoiceSample,
  getVoiceGenerationJob,
  getVoiceProjectStatus,
  hydrateProjectVoice,
  readOwnerVoiceArtifact,
  resolveVoiceArtifacts,
  setupVoicevoxProfile,
  VoiceGenerationError,
  voicevoxTuningStatusSchema
} from "../voicevox/service";
import { z } from "zod";
import { DASHBOARD_ASSET_VERSION, dashboardScriptResponse } from "./assets";
import {
  dashboardPage,
  dashboardStyleResponse,
  draftRevisionPage,
  landingPage,
  projectDetailPage,
  projectNotFoundPage,
  redirectPage,
  slideReviewPage,
  slideWorkspacePage,
  userGuidePage,
  voiceFinishPage
} from "./pages";

const MAX_FORM_BYTES = 16 * 1024;
const MAX_JSON_BYTES = 128 * 1024;
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

const reviewInstructionRequestSchema = z.object({
  comment_ids: z.array(z.string().uuid()).min(1).max(20)
});

const projectFieldsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  title: z.string().min(1).max(120).optional(),
  stage: projectStageSchema.optional(),
  summary: z.string().max(2_000).optional(),
  question: z.string().max(2_000).optional(),
  hypothesis: z.string().max(4_000).optional(),
  method: z.string().max(20_000).optional()
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "expected_version"),
  { message: "更新する項目を1つ以上指定してください。" }
);
const projectListItemRequestSchema = z.discriminatedUnion("action", [
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("add"),
    list: z.enum(["findings", "limitations"]),
    value: z.string().trim().min(1).max(4_000)
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("update"),
    list: z.enum(["findings", "limitations"]),
    index: z.number().int().nonnegative().max(99),
    value: z.string().trim().min(1).max(4_000)
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("delete"),
    list: z.enum(["findings", "limitations"]),
    index: z.number().int().nonnegative().max(99)
  })
]);
const imageAltRequestSchema = z.object({
  alt_text: z.string().max(500)
});

const previewRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

const draftRestoreRequestSchema = z.object({
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

const voiceSampleRequestSchema = z.object({
  profile_id: z.string().regex(/^voicevox-style-\d+$/),
  tuning: voicevoxTuningStatusSchema
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
  composition_background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  composition_clip_content: z.boolean().optional(),
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
const slideCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  position: z.number().int().nonnegative().max(99),
  template: z.enum(["flow", "cover", "canvas", "scene"])
});
const slideSplitRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  split_offset: z.number().int().positive().max(19_999),
  title: z.string().min(1).max(120),
  duration_seconds: z.number().int().min(2).max(1_200),
  content_markdown: z.string().min(3).max(20_000),
  sidebar_markdown: z.string().max(10_000)
});
const slideCompositionCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  mode: z.enum(["canvas", "scene"])
});

const slideTypographyRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  typography: slideTypographySchema
});
const sceneComponentRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  component: slideSceneNodeSchema
});
const sceneComponentActionRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["duplicate", "delete"])
});
const sceneComponentItemActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ expected_version: z.number().int().positive(), action: z.literal("add") }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("delete"),
    item_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("move"),
    item_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    position: z.number().int().nonnegative().max(11)
  })
]);
const sceneComponentCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  kind: z.enum(["layer", "stack", "grid", "hero", "markdown", "image", "shape", "card", "metric", "quote", "callout", "bar_chart", "timeline"]),
  parent_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable(),
  asset_id: z.string().uuid().nullable().optional()
});
const canvasBlockRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  block: slideBlockSchema
});
const canvasBlockActionRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["duplicate", "delete"])
});
const canvasBlockCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  kind: z.enum(["markdown", "image", "shape"]),
  asset_id: z.string().uuid().nullable().optional()
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

const narrationSegmentRequestSchema = z
  .object({
    text: narrationSegmentSchema.shape.text,
    speaker: narrationSegmentSchema.shape.speaker,
    voice_profile_id: narrationSegmentSchema.shape.voice_profile_id,
    voice_tuning: narrationSegmentSchema.shape.voice_tuning,
    voice_cues: narrationSegmentSchema.shape.voice_cues,
    pause_before_ms: narrationSegmentSchema.shape.pause_before_ms,
    pause_after_ms: narrationSegmentSchema.shape.pause_after_ms
  })
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
    projects: await listDashboardProjects(env.DB, session.userId)
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
  const [assets, publication, draftRevisions, renderedQualityReport] = await Promise.all([
    listProjectAssets(env.DB, session.userId, projectId),
    getPublicationStatus(env.DB, session.userId, projectId),
    listProjectDraftRevisions(env.DB, session.userId, projectId, 50),
    getRenderedQualityReport(env.DB, session.userId, projectId)
  ]);
  const searchParams = new URL(request.url).searchParams;
  const selectedResearchItemMatch = searchParams
    .get("research_item")
    ?.match(/^(findings|limitations):(\d{1,2})$/);
  const requestedLogPage = Number(searchParams.get("log_page"));
  return projectDetailPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    assets,
    publication: publication!,
    draftRevisions,
    renderedQualityReport,
    selectedLogPage: Number.isInteger(requestedLogPage) && requestedLogPage > 0
      ? Math.min(requestedLogPage, Math.ceil(RESEARCH_LOG_LIMIT / RESEARCH_LOG_PAGE_SIZE))
      : 1,
    selectedResearchItem: selectedResearchItemMatch?.[1] !== undefined && selectedResearchItemMatch[2] !== undefined
      ? {
          list: selectedResearchItemMatch[1] as "findings" | "limitations",
          index: Number(selectedResearchItemMatch[2])
        }
      : null
  });
}

async function handleDraftRevisionPage(
  request: Request,
  env: Env,
  projectId: string,
  version: number
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return redirectPage("/", clearWebSessionCookies());
  const [current, revision] = await Promise.all([
    getProject(env.DB, session.userId, projectId),
    getProjectDraftRevision(env.DB, session.userId, projectId, version)
  ]);
  if (current === null || revision === null) return projectNotFoundPage();
  return draftRevisionPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    current,
    revision
  });
}

async function handleDraftRevisionFrame(
  request: Request,
  env: Env,
  projectId: string,
  version: number
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return new Response(null, { status: 404 });
  const revision = await getProjectDraftRevision(env.DB, session.userId, projectId, version);
  if (revision === null || revision.document.deck === null) return new Response(null, { status: 404 });
  const baseProject = {
    project_id: revision.project_id,
    version: revision.version,
    created_at: revision.created_at,
    updated_at: revision.created_at,
    document: revision.document
  };
  const artifacts = await resolveVoiceArtifacts(env.DB, session.userId, baseProject);
  const project = hydrateProjectVoice(
    baseProject,
    artifacts,
    (segment) => `/api/projects/${projectId}/voice/audio/${segment.fingerprint}`
  );
  const html = renderPresentationHtml(project, { frameAncestors: "'self'" });
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

async function handleDraftRevisionRestore(
  request: Request,
  env: Env,
  projectId: string,
  targetVersion: number
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
  const parsed = draftRestoreRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_FIELDS", message: "復元対象を確認してください。" }, request_id: crypto.randomUUID() },
      422
    );
  }
  try {
    const project = await restoreProjectDraftRevision(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      targetVersion
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.draft_restored",
      outcome: "succeeded",
      details: { project_id: projectId, target_version: targetVersion, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      restored_from_version: targetVersion,
      version: project.version,
      next_url: `/dashboard/projects/${projectId}`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    if (error instanceof ProjectRepositoryError && error.code === "PROJECT_TOO_LARGE") {
      return projectMutationErrorResponse(error, "下書きを復元できませんでした。");
    }
    const code = error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : "INTERNAL_ERROR";
    const currentVersion = error instanceof Error && "currentVersion" in error
      ? ((error as { currentVersion?: number }).currentVersion ?? null)
      : null;
    return jsonResponse(
      {
        ok: false,
        current_version: currentVersion,
        error: {
          code,
          message: code === "PROJECT_VERSION_CONFLICT"
            ? "別の場所で更新されました。画面を読み込み直してください。"
            : code === "PROJECT_NOT_FOUND"
              ? "指定した下書き履歴が見つかりません。"
              : "下書きを復元できませんでした。"
        },
        request_id: crypto.randomUUID()
      },
      code === "PROJECT_VERSION_CONFLICT" ? 409 : code === "PROJECT_NOT_FOUND" ? 404 : 500
    );
  }
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
  const url = new URL(request.url);
  const selectedNarrationAt = url.searchParams.get("narration");
  return slideWorkspacePage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    slideId,
    selectedComponentId: url.searchParams.get("component"),
    selectedNarrationAt: selectedNarrationAt !== null && /^\d+$/.test(selectedNarrationAt)
      ? Number(selectedNarrationAt)
      : null,
    assets: await listProjectAssets(env.DB, session.userId, projectId)
  });
}

async function handleSlideReviewPage(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const session = await readWebSession(request, env.DB);
  if (session === null) return redirectPage("/", clearWebSessionCookies());
  const project = await getHydratedProject(env, session.userId, projectId);
  if (project === null || project.document.deck === null) return projectNotFoundPage();
  const requestedSlide = new URL(request.url).searchParams.get("slide");
  const slideId = requestedSlide !== null && project.document.deck.slides.some((slide) => slide.id === requestedSlide)
    ? requestedSlide
    : project.document.deck.slides[0]?.id;
  if (slideId === undefined) return projectNotFoundPage();
  return slideReviewPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    slideId,
    comments: await listReviewComments(env.DB, session.userId, projectId, { limit: 200 })
  });
}

async function handleReviewCommentCreate(
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
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = reviewCommentCreateSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_REVIEW_COMMENT", message: "コメント対象と本文を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  const project = await getProject(env.DB, session.userId, projectId);
  if (project === null) {
    return jsonResponse({ ok: false, error: { code: "PROJECT_NOT_FOUND", message: "研究が見つかりません。" }, request_id: crypto.randomUUID() }, 404);
  }
  try {
    const comment = await addSlideReviewComment(env.DB, session.userId, project, slideId, parsed.data);
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "slide.review_comment_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, comment_id: comment.id, target_key: comment.target_key },
      createdAt: comment.created_at
    });
    return jsonResponse({
      ok: true,
      comment,
      next_url: `/dashboard/projects/${projectId}/review?slide=${encodeURIComponent(slideId)}#review-comment-${comment.id}`,
      error: null,
      request_id: crypto.randomUUID()
    }, 201);
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      const status = error.code === "SLIDE_NOT_FOUND" || error.code === "REVIEW_TARGET_NOT_FOUND" ? 404 : error.code === "REVIEW_COMMENT_LIMIT_REACHED" ? 409 : 422;
      return jsonResponse({ ok: false, error: { code: error.code, message: error.message }, request_id: crypto.randomUUID() }, status);
    }
    throw error;
  }
}

async function handleReviewCommentMutation(
  request: Request,
  env: Env,
  projectId: string,
  commentId: string
): Promise<Response> {
  if (request.method !== "PATCH" && request.method !== "DELETE") {
    return new Response(null, { status: 405, headers: { allow: "PATCH, DELETE" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  if (request.method === "DELETE") {
    const deleted = await deleteReviewComment(env.DB, session.userId, projectId, commentId);
    if (!deleted) return jsonResponse({ ok: false, error: { code: "REVIEW_COMMENT_NOT_FOUND", message: "コメントが見つかりません。" }, request_id: crypto.randomUUID() }, 404);
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "slide.review_comment_deleted",
      outcome: "succeeded",
      details: { project_id: projectId, comment_id: commentId },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, comment_id: commentId, deleted: true, error: null, request_id: crypto.randomUUID() });
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = reviewCommentStatusSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_REVIEW_STATUS", message: "コメントの状態を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  const comment = await setReviewCommentStatus(env.DB, session.userId, projectId, commentId, parsed.data.status);
  if (comment === null) return jsonResponse({ ok: false, error: { code: "REVIEW_COMMENT_NOT_FOUND", message: "コメントが見つかりません。" }, request_id: crypto.randomUUID() }, 404);
  await recordWebAudit(env.DB, {
    userId: session.userId,
    eventType: "slide.review_comment_status_changed",
    outcome: "succeeded",
    details: { project_id: projectId, comment_id: commentId, status: comment.status },
    createdAt: comment.updated_at
  });
  return jsonResponse({ ok: true, comment, error: null, request_id: crypto.randomUUID() });
}

async function handleReviewInstruction(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = reviewInstructionRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_COMMENT_SELECTION", message: "未解決コメントを1〜20件選んでください。" }, request_id: crypto.randomUUID() }, 422);
  }
  const [project, comments] = await Promise.all([
    getProject(env.DB, session.userId, projectId),
    listReviewComments(env.DB, session.userId, projectId, { status: "open", limit: 200 })
  ]);
  if (project === null) return jsonResponse({ ok: false, error: { code: "PROJECT_NOT_FOUND", message: "研究が見つかりません。" }, request_id: crypto.randomUUID() }, 404);
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const selected = parsed.data.comment_ids.map((id) => byId.get(id)).filter((comment) => comment !== undefined);
  if (selected.length !== parsed.data.comment_ids.length) {
    return jsonResponse({ ok: false, error: { code: "REVIEW_COMMENT_NOT_FOUND", message: "選択したコメントが更新または解決されています。画面を更新してください。" }, request_id: crypto.randomUUID() }, 409);
  }
  return jsonResponse({
    ok: true,
    instruction: buildReviewRepairInstruction(project, selected),
    comment_count: selected.length,
    project_version: project.version,
    error: null,
    request_id: crypto.randomUUID()
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
    editorFrame: true,
    editorPrelude: new URL(request.url).searchParams.get("prelude") === "1"
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
  if (error instanceof ProjectRepositoryError) {
    return projectMutationErrorResponse(error, "VOICEVOX設定を保存できませんでした。");
  }
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
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const status = url.searchParams.get("status");
  return voiceFinishPage({
    twitchLogin: session.twitchLogin,
    csrfToken: session.csrfToken,
    project,
    voice: { ...voice, ok: true },
    page: Number.isInteger(page) && page > 0 ? page : 1,
    query: (url.searchParams.get("q") ?? "").slice(0, 100),
    selectedSegmentKey: (url.searchParams.get("segment") ?? "").match(
      /^[a-z0-9][a-z0-9-]{0,63}:\d{1,3}$/
    )?.[0] ?? null,
    status: ["ready", "needs_generation", "failed"].includes(status ?? "")
      ? status as "ready" | "needs_generation" | "failed"
      : "all"
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
        invalidateVoiceProfileAudio(document, profile.id);
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

async function handleVoiceSample(
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
  const parsed = voiceSampleRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "声と調声値の範囲を確認してください。" },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  const project = await getProject(env.DB, session.userId, projectId);
  if (project === null) return new Response(null, { status: 404 });
  try {
    const sample = await getOrCreateVoiceSample(env, {
      profileId: parsed.data.profile_id,
      tuning: parsed.data.tuning,
      onCacheMiss: async () => {
        const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
        const usage = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM audit_events
           WHERE user_id = ? AND event_type = 'voicevox.sample_generated' AND created_at >= ?`
        ).bind(session.userId, cutoff).first<{ count: number }>();
        if (Number(usage?.count ?? 0) >= 12) {
          throw new VoiceGenerationError(
            "VOICE_JOB_LIMIT",
            "新しいVOICEVOX試聴は24時間に12種類までです。生成済みの組み合わせは引き続き試聴できます。"
          );
        }
        await recordAuditEvent(env.DB, {
          userId: session.userId,
          eventType: "voicevox.sample_generated",
          outcome: "requested",
          details: { project_id: projectId, profile_id: parsed.data.profile_id },
          createdAt: new Date().toISOString()
        });
      }
    });
    return new Response(sample.bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "content-type": "audio/mpeg",
        "x-content-type-options": "nosniff",
        "x-voicevox-cache": sample.cached ? "hit" : "miss",
        "x-voicevox-profile": encodeURIComponent(sample.profileLabel)
      }
    });
  } catch (error) {
    return voiceErrorResponse(error);
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
    const { expected_version, ...fields } = parsed.data;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: expected_version,
      mutate: (document) => {
        if (fields.title !== undefined) document.title = fields.title;
        if (fields.stage !== undefined) document.stage = fields.stage;
        if (fields.summary !== undefined) document.summary = fields.summary;
        if (fields.question !== undefined) document.question = fields.question.trim() || null;
        if (fields.hypothesis !== undefined) document.hypothesis = fields.hypothesis.trim() || null;
        if (fields.method !== undefined) document.method = fields.method.trim() || null;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.fields_updated",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        version: project.version,
        changed_fields: Object.keys(fields).join(",")
      },
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
    if (error instanceof ProjectRepositoryError && error.code === "PROJECT_TOO_LARGE") {
      return projectMutationErrorResponse(error, "変更を保存できませんでした。");
    }
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

async function handleProjectListItemUpdate(
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
  const parsed = projectListItemRequestSchema.safeParse(read.value);
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
    const input = parsed.data;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: input.expected_version,
      mutate: (document) => {
        const values = document[input.list];
        if (input.action === "add") {
          if (values.length >= 100) {
            const error = new Error("list full") as Error & { code: string };
            error.code = "INVALID_FIELDS";
            throw error;
          }
          values.push(input.value);
          return;
        }
        if (input.index >= values.length) {
          const error = new Error("item not found") as Error & { code: string };
          error.code = "INVALID_FIELDS";
          throw error;
        }
        if (input.action === "delete") values.splice(input.index, 1);
        else values[input.index] = input.value;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: `project.${parsed.data.list}_item_${parsed.data.action === "add" ? "added" : parsed.data.action === "update" ? "updated" : "deleted"}`,
      outcome: "succeeded",
      details: {
        project_id: projectId,
        version: project.version,
        index: "index" in parsed.data ? parsed.data.index : project.document[parsed.data.list].length - 1
      },
      createdAt: new Date().toISOString()
    });
    const itemIndex = parsed.data.action === "delete"
      ? null
      : "index" in parsed.data
        ? parsed.data.index
        : project.document[parsed.data.list].length - 1;
    const listAnchor = `research-list-${parsed.data.list}`;
    return jsonResponse({
      ok: true,
      project_id: projectId,
      version: project.version,
      updated_at: project.updated_at,
      item_index: itemIndex,
      next_url: itemIndex === null
        ? `/dashboard/projects/${projectId}#${listAnchor}`
        : `/dashboard/projects/${projectId}?research_item=${parsed.data.list}:${itemIndex}#research-item-${parsed.data.list}-${itemIndex}`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "項目を保存できませんでした。");
  }
}

async function handleResearchLogDelete(
  request: Request,
  env: Env,
  projectId: string,
  entryId: string
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
  const parsed = previewRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_FIELDS", message: "入力内容を確認してください。" }, request_id: crypto.randomUUID() },
      422
    );
  }
  try {
    const logPageValue = new URL(request.url).searchParams.get("log_page");
    const returnLogPage = logPageValue !== null && /^(?:[1-9]|1\d|2[0-5])$/.test(logPageValue)
      ? Number(logPageValue)
      : 1;
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const index = document.logs.findIndex((entry) => entry.id === entryId);
        if (index === -1) {
          const error = new Error("log entry not found") as Error & { code: string };
          error.code = "LOG_ENTRY_NOT_FOUND";
          throw error;
        }
        document.logs.splice(index, 1);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.research_log_deleted",
      outcome: "succeeded",
      details: { project_id: projectId, entry_id: entryId, version: project.version },
      createdAt: new Date().toISOString()
    });
    const availableLogPage = Math.min(
      returnLogPage,
      Math.max(1, Math.ceil(project.document.logs.length / RESEARCH_LOG_PAGE_SIZE))
    );
    return jsonResponse({
      ok: true,
      project_id: projectId,
      entry_id: entryId,
      version: project.version,
      updated_at: project.updated_at,
      next_url: `/dashboard/projects/${projectId}${availableLogPage > 1 ? `?log_page=${availableLogPage}` : ""}#research-log`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "研究ログを削除できませんでした。");
  }
}

async function handleRenderedQualityReportSave(
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
      { ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() },
      403
    );
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = renderedQualityReportInputSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_QUALITY_REPORT", message: "表示確認結果を保存できませんでした。" }, request_id: crypto.randomUUID() },
      422
    );
  }
  const project = await getProject(env.DB, session.userId, projectId);
  if (project === null) {
    return jsonResponse(
      { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "研究が見つかりません。" }, request_id: crypto.randomUUID() },
      404
    );
  }
  if (
    project.version !== parsed.data.project_version ||
    parsed.data.renderer_version !== PRESENTATION_RENDERER_VERSION
  ) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "QUALITY_REPORT_STALE", message: "研究または表示エンジンが更新されています。もう一度確認してください。" },
        current_version: project.version,
        renderer_version: PRESENTATION_RENDERER_VERSION,
        request_id: crypto.randomUUID()
      },
      409
    );
  }
  const report = await saveRenderedQualityReport(
    env.DB,
    session.userId,
    projectId,
    parsed.data
  );
  await recordWebAudit(env.DB, {
    userId: session.userId,
    eventType: "project.rendered_quality_checked",
    outcome: "succeeded",
    details: {
      project_id: projectId,
      version: report.project_version,
      status: report.status,
      issue_count: report.issue_count
    },
    createdAt: report.created_at
  });
  return jsonResponse({
    ok: true,
    project_id: projectId,
    project_version: report.project_version,
    renderer_version: report.renderer_version,
    status: report.status,
    issue_count: report.issue_count,
    saved_at: report.created_at,
    error: null,
    request_id: crypto.randomUUID()
  });
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
    const {
      expected_version,
      sidebar_markdown,
      composition_background,
      composition_clip_content,
      ...fields
    } = parsed.data;
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
        if (composition_background !== undefined || composition_clip_content !== undefined) {
          if (slide.composition === null || slide.composition === undefined) {
            const error = new Error("The slide does not use a free composition.");
            Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
            throw error;
          }
          if (composition_background !== undefined) slide.composition.background = composition_background;
          if (composition_clip_content !== undefined) slide.composition.clip_content = composition_clip_content;
        }
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
    if (error instanceof ProjectRepositoryError && error.code === "PROJECT_TOO_LARGE") {
      return projectMutationErrorResponse(error, "スライドを保存できませんでした。");
    }
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
          : code === "INVALID_COMPOSITION_MODE"
            ? 422
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
                : code === "INVALID_COMPOSITION_MODE"
                  ? "自由配置またはリッチ構成のスライドでのみ背景を変更できます。"
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

async function handleSlideCreate(
  request: Request,
  env: Env,
  projectId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "追加するスライドを確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  const slideId = `slide-${crypto.randomUUID()}`;
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
        if (deck.slides.length >= 100) {
          const error = new Error("The slide limit has been reached.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        const title = parsed.data.title;
        const common = {
          id: slideId,
          title,
          duration_seconds: parsed.data.template === "cover" ? 30 : 60,
          reveal_steps: 0,
          tone: "dark" as const,
          template_id: deck.default_template_id ?? null,
          enter_animation: null,
          role: parsed.data.template === "cover" ? "cover" as const : "content" as const,
          cover_layout: "center" as const,
          content_markdown: parsed.data.template === "cover" ? `# ${title}` : `## ${title}\n\nここに伝えたい内容を入力します。`,
          reveal_blocks: [],
          sidebar_markdown: null,
          narration: null
        };
        const composition = parsed.data.template === "canvas"
          ? {
              mode: "canvas" as const,
              background: "#111827",
              clip_content: true,
              blocks: [{
                id: "text-1",
                kind: "markdown" as const,
                frame: { x: 10, y: 12, width: 80, height: 72 },
                z_index: 0,
                at: 0,
                animation: "fade" as const,
                markdown: `# ${title}\n\nここに内容を入力します。`
              }]
            }
          : parsed.data.template === "scene"
            ? {
                mode: "scene" as const,
                runtime_version: "uf-runtime@1" as const,
                background: "#111827",
                clip_content: true,
                nodes: [
                  { id: "root", kind: "stack" as const, parent_id: null, order: 0, at: 0, animation: "fade" as const, frame: { x: 6, y: 7, width: 88, height: 86 }, direction: "column" as const, gap_px: 16, align: "stretch" as const, justify: "center" as const, wrap: false },
                  { id: "heading", kind: "hero" as const, parent_id: "root", order: 0, at: 0, animation: "fade" as const, frame: null, eyebrow: null, heading: title, subtitle: "ここに補足文を入力します。", align: "start" as const }
                ]
              }
            : undefined;
        const slide = projectSlideSchema.parse({ ...common, ...(composition === undefined ? {} : { composition }) });
        deck.slides.splice(Math.min(parsed.data.position, deck.slides.length), 0, slide);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, template: parsed.data.template, position: parsed.data.position, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, version: project.version, next_url: `/dashboard/projects/${projectId}/slides/${slideId}`, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "スライドを追加できませんでした。");
  }
}

async function handleSlideSplit(
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
  const parsed = slideSplitRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_FIELDS",
          message: "本文と分割位置を確認してください。"
        },
        request_id: crypto.randomUUID()
      },
      422
    );
  }
  const nextSlideId = `slide-${crypto.randomUUID()}`;
  try {
    const project = await mutateProject(env.DB, {
      ownerUserId: session.userId,
      projectId,
      expectedVersion: parsed.data.expected_version,
      mutate: (document) => {
        const deck = document.deck;
        const slideIndex = deck?.slides.findIndex((slide) => slide.id === slideId) ?? -1;
        const slide = slideIndex === -1 ? undefined : deck?.slides[slideIndex];
        if (deck === null || deck === undefined || slide === undefined) {
          const error = new Error("The slide does not exist.");
          Object.assign(error, { code: "SLIDE_NOT_FOUND" });
          throw error;
        }
        if (slide.composition !== null && slide.composition !== undefined) {
          const error = new Error("Only flow slides can be split.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        if (slide.role === "cover" || deck.slides.length >= 100) {
          const error = new Error("The slide cannot be split.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        const before = parsed.data.content_markdown
          .slice(0, parsed.data.split_offset)
          .trim();
        const after = parsed.data.content_markdown
          .slice(parsed.data.split_offset)
          .trim();
        if (before.length === 0 || after.length === 0) {
          const error = new Error("Both split slides require content.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        const beforeRatio = before.length / (before.length + after.length);
        const beforeDuration = Math.min(
          parsed.data.duration_seconds - 1,
          Math.max(1, Math.round(parsed.data.duration_seconds * beforeRatio))
        );
        const afterDuration = Math.max(
          1,
          parsed.data.duration_seconds - beforeDuration
        );
        const totalSteps = slide.reveal_steps + 1;
        const splitStep = totalSteps < 2
          ? totalSteps
          : Math.min(totalSteps - 1, Math.max(1, Math.round(totalSteps * beforeRatio)));
        const originalReveals = slide.reveal_blocks;
        const originalNarration = slide.narration;
        const beforeReveals = originalReveals.filter((block) => block.at < splitStep);
        const afterReveals = originalReveals
          .filter((block) => block.at >= splitStep)
          .map((block) => ({ ...block, at: block.at - splitStep }));
        const beforeSegments = originalNarration?.segments.filter((segment) => segment.at < splitStep) ?? [];
        const afterSegments = originalNarration?.segments
          .filter((segment) => segment.at >= splitStep)
          .map((segment) => ({ ...segment, at: segment.at - splitStep })) ?? [];
        slide.title = parsed.data.title;
        slide.content_markdown = before;
        slide.sidebar_markdown = parsed.data.sidebar_markdown.trim() || null;
        slide.duration_seconds = beforeDuration;
        slide.reveal_steps = Math.max(0, splitStep - 1);
        slide.reveal_blocks = beforeReveals;
        slide.narration = originalNarration === null
          ? null
          : { ...originalNarration, segments: beforeSegments };
        const suffix = "（続き）";
        const nextTitle = `${parsed.data.title.slice(0, 120 - suffix.length)}${suffix}`;
        const nextSlide = projectSlideSchema.parse({
          ...slide,
          id: nextSlideId,
          title: nextTitle,
          duration_seconds: afterDuration,
          reveal_steps: Math.max(0, totalSteps - splitStep - 1),
          role: "content",
          cover_layout: "center",
          content_markdown: after,
          reveal_blocks: afterReveals,
          sidebar_markdown: parsed.data.sidebar_markdown.trim() || null,
          narration: originalNarration === null || afterSegments.length === 0
            ? null
            : { ...originalNarration, segments: afterSegments },
          composition: null
        });
        deck.slides.splice(slideIndex + 1, 0, nextSlide);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_split",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        slide_id: slideId,
        next_slide_id: nextSlideId,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      project_id: projectId,
      slide_id: slideId,
      next_slide_id: nextSlideId,
      version: project.version,
      next_url: `/dashboard/projects/${projectId}/slides/${nextSlideId}`,
      error: null,
      request_id: crypto.randomUUID()
    });
  } catch (error) {
    return projectMutationErrorResponse(error, "スライドを分割できませんでした。");
  }
}

async function handleSlideCompositionCreate(
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
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = slideCompositionCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "開始する自由構成を選んでください。" }, request_id: crypto.randomUUID() }, 422);
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
        if (slide.composition !== null && slide.composition !== undefined) {
          const error = new Error("The slide already uses a free composition.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        const sidebar = slide.sidebar_markdown?.trim() || null;
        if (parsed.data.mode === "canvas") {
          slide.composition = {
            mode: "canvas",
            background: "#111827",
            clip_content: true,
            blocks: [
              {
                id: "main-text",
                kind: "markdown",
                frame: { x: 5, y: 7, width: sidebar === null ? 90 : 63, height: 86 },
                z_index: 0,
                at: 0,
                animation: "fade",
                markdown: slide.content_markdown
              },
              ...(sidebar === null ? [] : [{
                id: "sidebar-text",
                kind: "markdown" as const,
                frame: { x: 71, y: 7, width: 24, height: 86 },
                z_index: 1,
                at: 0,
                animation: "fade" as const,
                markdown: sidebar
              }])
            ]
          };
        } else {
          slide.composition = {
            mode: "scene",
            runtime_version: "uf-runtime@1",
            background: "#111827",
            clip_content: true,
            nodes: [
              { id: "root", kind: "stack", parent_id: null, order: 0, at: 0, animation: "fade", frame: { x: 6, y: 7, width: 88, height: 86 }, direction: sidebar === null ? "column" : "row", gap_px: 16, align: "stretch", justify: "center", wrap: false },
              { id: "main-text", kind: "markdown", parent_id: "root", order: 0, at: 0, animation: "fade", frame: null, markdown: slide.content_markdown },
              ...(sidebar === null ? [] : [{ id: "sidebar-card", kind: "card" as const, parent_id: "root", order: 1, at: 0, animation: "fade" as const, frame: null, label: "補足", markdown: sidebar, variant: "accent" as const }])
            ]
          };
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_composition_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, mode: parsed.data.mode, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, mode: parsed.data.mode, version: project.version, next_url: `/dashboard/projects/${projectId}/slides/${slideId}`, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "自由構成を開始できませんでした。");
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
        const previousParentId = existing.parent_id;
        if (component.parent_id !== null) {
          const parent = slide.composition.nodes.find((node) => node.id === component.parent_id);
          if (parent === undefined || !["layer", "stack", "grid"].includes(parent.kind)) {
            const error = new Error("The selected parent cannot contain components.");
            Object.assign(error, { code: "INVALID_FIELDS" });
            throw error;
          }
          const visited = new Set<string>();
          let ancestor: SlideSceneNode | undefined = parent;
          while (ancestor !== undefined) {
            if (ancestor.id === componentId || visited.has(ancestor.id)) {
              const error = new Error("The component hierarchy cannot contain a cycle.");
              Object.assign(error, { code: "INVALID_FIELDS" });
              throw error;
            }
            visited.add(ancestor.id);
            ancestor = ancestor.parent_id === null
              ? undefined
              : slide.composition.nodes.find((node) => node.id === ancestor!.parent_id);
          }
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
                at: component.items[itemIndex]!.at,
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
                at: component.items[itemIndex]!.at,
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
        existing.frame = component.frame;
        existing.at = component.at;
        existing.animation = component.animation;
        existing.style = component.style;
        existing.parent_id = component.parent_id;
        const targetSiblings = slide.composition.nodes
          .filter((node) => node.parent_id === component.parent_id && node.id !== componentId)
          .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
        targetSiblings.splice(Math.min(component.order, targetSiblings.length), 0, existing);
        targetSiblings.forEach((node, siblingIndex) => { node.order = siblingIndex; });
        if (previousParentId !== component.parent_id) {
          slide.composition.nodes
            .filter((node) => node.parent_id === previousParentId)
            .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
            .forEach((node, siblingIndex) => { node.order = siblingIndex; });
        }
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

async function handleCanvasBlockUpdate(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  blockId: string
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(null, { status: 405, headers: { allow: "PATCH" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = canvasBlockRequestSchema.safeParse(read.value);
  if (!parsed.success || parsed.data.block.id !== blockId) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "表示パーツの入力内容を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  if (parsed.data.block.kind === "image") {
    const imageAssetId = parsed.data.block.asset_id;
    const assets = await listProjectAssets(env.DB, session.userId, projectId);
    if (!assets.some((asset) => asset.asset_id === imageAssetId)) {
      return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "この研究で利用できる画像を選んでください。" }, request_id: crypto.randomUUID() }, 422);
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
        if (slide.composition?.mode !== "canvas") {
          const error = new Error("The slide does not use a canvas composition.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        const index = slide.composition.blocks.findIndex((block) => block.id === blockId);
        const existing = slide.composition.blocks[index];
        if (existing === undefined) {
          const error = new Error("The canvas block does not exist.");
          Object.assign(error, { code: "BLOCK_NOT_FOUND" });
          throw error;
        }
        if (existing.kind !== parsed.data.block.kind) {
          const error = new Error("The canvas block kind cannot be changed here.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        slide.composition.blocks[index] = parsed.data.block;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_canvas_block_updated",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, block_id: blockId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, block_id: blockId, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "表示パーツを保存できませんでした。");
  }
}

async function handleSceneComponentCreate(
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
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = sceneComponentCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "追加する表示パーツを確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  let imageAsset: ProjectAsset | undefined;
  if (parsed.data.kind === "image") {
    const assets = await listProjectAssets(env.DB, session.userId, projectId);
    imageAsset = assets.find((asset) => asset.asset_id === parsed.data.asset_id);
    if (imageAsset === undefined) {
      return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "この研究で利用できる画像を選んでください。" }, request_id: crypto.randomUUID() }, 422);
    }
  }
  let createdComponentId = "";
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
        if (slide.composition.nodes.length >= 200) {
          const error = new Error("The scene component limit has been reached.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        if (parsed.data.parent_id !== null) {
          const parent = slide.composition.nodes.find((node) => node.id === parsed.data.parent_id);
          if (parent === undefined || !["layer", "stack", "grid"].includes(parent.kind)) {
            const error = new Error("The selected parent cannot contain components.");
            Object.assign(error, { code: "INVALID_FIELDS" });
            throw error;
          }
        }
        const used = new Set(slide.composition.nodes.map((node) => node.id));
        const base = parsed.data.kind.replaceAll("_", "-");
        let suffix = 1;
        while (used.has(`${base}-${suffix}`)) suffix += 1;
        createdComponentId = `${base}-${suffix}`;
        const siblings = slide.composition.nodes.filter((node) => node.parent_id === parsed.data.parent_id);
        const common = {
          id: createdComponentId,
          parent_id: parsed.data.parent_id,
          order: Math.min(999, Math.max(-1, ...siblings.map((node) => node.order)) + 1),
          at: 0,
          animation: "fade" as const,
          frame: parsed.data.parent_id === null
            ? { x: 10 + Math.min(10, siblings.length * 2), y: 12 + Math.min(10, siblings.length * 2), width: 80, height: 72 }
            : null
        };
        let component: SlideSceneNode;
        switch (parsed.data.kind) {
          case "layer": component = { ...common, kind: "layer" }; break;
          case "stack": component = { ...common, kind: "stack", direction: "column", gap_px: 16, align: "stretch", justify: "start", wrap: false }; break;
          case "grid": component = { ...common, kind: "grid", columns: 2, gap_px: 16, align: "stretch" }; break;
          case "hero": component = { ...common, kind: "hero", eyebrow: null, heading: "新しい見出し", subtitle: "ここに補足文を入力します。", align: "start" }; break;
          case "markdown": component = { ...common, kind: "markdown", markdown: "## 新しいテキスト\n\nここに内容を入力します。" }; break;
          case "image": component = { ...common, kind: "image", asset_id: imageAsset!.asset_id, alt_text: imageAsset!.alt_text, fit: "contain", caption: null }; break;
          case "shape": component = { ...common, kind: "shape", shape: "rectangle", label: "新しい図形" }; break;
          case "card": component = { ...common, kind: "card", label: "カード", markdown: "ここに内容を入力します。", variant: "plain" }; break;
          case "metric": component = { ...common, kind: "metric", value: "100", unit: null, caption: "数値の説明", emphasis: "strong" }; break;
          case "quote": component = { ...common, kind: "quote", quote: "ここに引用文を入力します。", attribution: null }; break;
          case "callout": component = { ...common, kind: "callout", label: "POINT", heading: "伝えたいこと", markdown: "ここに補足を入力します。", variant: "info" }; break;
          case "bar_chart": component = { ...common, kind: "bar_chart", max_value: 100, items: [{ id: "item-1", at: 0, label: "項目1", value: 50, color: null }] }; break;
          case "timeline": component = { ...common, kind: "timeline", items: [{ id: "item-1", at: 0, kicker: null, heading: "出来事1", detail: "ここに詳細を入力します。" }] }; break;
        }
        slide.composition.nodes.push(component);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_scene_component_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, component_id: createdComponentId, kind: parsed.data.kind, parent_id: parsed.data.parent_id, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, component_id: createdComponentId, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "表示パーツを追加できませんでした。");
  }
}

async function handleSceneComponentItemAction(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  componentId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = sceneComponentItemActionRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "データ項目の操作内容を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  let resultItemId: string | null = null;
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
        const component = slide.composition.nodes.find((node) => node.id === componentId);
        if (component === undefined) {
          const error = new Error("The component does not exist.");
          Object.assign(error, { code: "COMPONENT_NOT_FOUND" });
          throw error;
        }
        if (component.kind !== "bar_chart" && component.kind !== "timeline") {
          const error = new Error("The component does not contain editable data items.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        if (parsed.data.action === "move") {
          const itemId = parsed.data.item_id;
          const position = parsed.data.position;
          if (component.kind === "bar_chart") {
            const index = component.items.findIndex((item) => item.id === itemId);
            const [item] = index === -1 ? [] : component.items.splice(index, 1);
            if (item === undefined) {
              const error = new Error("The data item does not exist.");
              Object.assign(error, { code: "INVALID_FIELDS" });
              throw error;
            }
            component.items.splice(Math.min(position, component.items.length), 0, item);
          } else {
            const index = component.items.findIndex((item) => item.id === itemId);
            const [item] = index === -1 ? [] : component.items.splice(index, 1);
            if (item === undefined) {
              const error = new Error("The data item does not exist.");
              Object.assign(error, { code: "INVALID_FIELDS" });
              throw error;
            }
            component.items.splice(Math.min(position, component.items.length), 0, item);
          }
          resultItemId = itemId;
          return;
        }
        if (parsed.data.action === "delete") {
          const itemId = parsed.data.item_id;
          if (component.items.length <= 1) {
            const error = new Error("A data component must keep at least one item.");
            Object.assign(error, { code: "INVALID_FIELDS" });
            throw error;
          }
          const index = component.items.findIndex((item) => item.id === itemId);
          if (index === -1) {
            const error = new Error("The data item does not exist.");
            Object.assign(error, { code: "INVALID_FIELDS" });
            throw error;
          }
          component.items.splice(index, 1);
          return;
        }
        if (component.items.length >= 12) {
          const error = new Error("The data item limit has been reached.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        const used = new Set(component.items.map((item) => item.id));
        let suffix = 1;
        while (used.has(`item-${suffix}`)) suffix += 1;
        resultItemId = `item-${suffix}`;
        const at = Math.min(slide.reveal_steps, Math.max(component.at, ...component.items.map((item) => item.at)));
        if (component.kind === "bar_chart") {
          component.items.push({ id: resultItemId, at, label: `項目${component.items.length + 1}`, value: Math.round(component.max_value / 2), color: null });
        } else {
          component.items.push({ id: resultItemId, at, kicker: null, heading: `出来事${component.items.length + 1}`, detail: "ここに詳細を入力します。" });
        }
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_scene_component_item_changed",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, component_id: componentId, action: parsed.data.action, item_id: parsed.data.action === "add" ? resultItemId : parsed.data.item_id, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, component_id: componentId, result_item_id: resultItemId, action: parsed.data.action, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "データ項目を操作できませんでした。");
  }
}

async function handleSceneComponentAction(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  componentId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = sceneComponentActionRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "表示パーツの操作内容を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  let resultComponentId: string | null = null;
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
        const component = slide.composition.nodes[index];
        if (component === undefined) {
          const error = new Error("The component does not exist.");
          Object.assign(error, { code: "COMPONENT_NOT_FOUND" });
          throw error;
        }
        if (parsed.data.action === "delete") {
          if (slide.composition.nodes.some((node) => node.parent_id === componentId)) {
            const error = new Error("The component still has children.");
            Object.assign(error, { code: "COMPONENT_HAS_CHILDREN" });
            throw error;
          }
          slide.composition.nodes.splice(index, 1);
          return;
        }
        const used = new Set(slide.composition.nodes.map((node) => node.id));
        const base = `${component.id.slice(0, 48)}-copy`;
        let candidate = base;
        for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base.slice(0, 58)}-${suffix}`;
        const copy = structuredClone(component);
        copy.id = candidate;
        const siblings = slide.composition.nodes.filter((node) => node.parent_id === component.parent_id);
        copy.order = Math.min(999, Math.max(-1, ...siblings.map((node) => node.order)) + 1);
        if (copy.frame) {
          copy.frame.x = Math.min(100 - copy.frame.width, copy.frame.x + 3);
          copy.frame.y = Math.min(100 - copy.frame.height, copy.frame.y + 3);
        }
        slide.composition.nodes.splice(index + 1, 0, copy);
        resultComponentId = candidate;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: `project.slide_component_${parsed.data.action}d`,
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, component_id: componentId, result_component_id: resultComponentId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, component_id: componentId, result_component_id: resultComponentId, action: parsed.data.action, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "表示パーツを操作できませんでした。");
  }
}

async function handleCanvasBlockCreate(
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
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = canvasBlockCreateRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "追加する表示パーツを確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  let imageAsset: ProjectAsset | undefined;
  if (parsed.data.kind === "image") {
    const assets = await listProjectAssets(env.DB, session.userId, projectId);
    imageAsset = assets.find((asset) => asset.asset_id === parsed.data.asset_id);
    if (imageAsset === undefined) {
      return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "この研究で利用できる画像を選んでください。" }, request_id: crypto.randomUUID() }, 422);
    }
  }
  let createdBlockId = "";
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
        if (slide.composition?.mode !== "canvas") {
          const error = new Error("The slide does not use a canvas composition.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        if (slide.composition.blocks.length >= 100) {
          const error = new Error("The canvas block limit has been reached.");
          Object.assign(error, { code: "INVALID_FIELDS" });
          throw error;
        }
        const used = new Set(slide.composition.blocks.map((block) => block.id));
        const base = parsed.data.kind === "markdown" ? "text" : parsed.data.kind;
        let suffix = 1;
        while (used.has(`${base}-${suffix}`)) suffix += 1;
        createdBlockId = `${base}-${suffix}`;
        const common = {
          id: createdBlockId,
          frame: { x: 10, y: 12, width: 80, height: 72 },
          z_index: Math.min(100, Math.max(-1, ...slide.composition.blocks.map((block) => block.z_index)) + 1),
          at: 0,
          animation: "fade" as const
        };
        const block = parsed.data.kind === "markdown"
          ? { ...common, kind: "markdown" as const, markdown: "# 新しいテキスト\n\nここに内容を入力します。" }
          : parsed.data.kind === "image"
            ? { ...common, kind: "image" as const, asset_id: imageAsset!.asset_id, alt_text: imageAsset!.alt_text, fit: "contain" as const }
            : { ...common, kind: "shape" as const, shape: "rectangle" as const, label: "新しい図形" };
        slide.composition.blocks.push(block);
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "project.slide_canvas_block_created",
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, block_id: createdBlockId, kind: parsed.data.kind, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, block_id: createdBlockId, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "表示パーツを追加できませんでした。");
  }
}

async function handleCanvasBlockAction(
  request: Request,
  env: Env,
  projectId: string,
  slideId: string,
  blockId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) {
    return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  }
  const read = await readRequestJson(request);
  if (!read.ok) return read.response;
  const parsed = canvasBlockActionRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: { code: "INVALID_FIELDS", message: "表示パーツの操作内容を確認してください。" }, request_id: crypto.randomUUID() }, 422);
  }
  let resultBlockId: string | null = null;
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
        if (slide.composition?.mode !== "canvas") {
          const error = new Error("The slide does not use a canvas composition.");
          Object.assign(error, { code: "INVALID_COMPOSITION_MODE" });
          throw error;
        }
        const index = slide.composition.blocks.findIndex((block) => block.id === blockId);
        const block = slide.composition.blocks[index];
        if (block === undefined) {
          const error = new Error("The canvas block does not exist.");
          Object.assign(error, { code: "BLOCK_NOT_FOUND" });
          throw error;
        }
        if (parsed.data.action === "delete") {
          slide.composition.blocks.splice(index, 1);
          return;
        }
        const used = new Set(slide.composition.blocks.map((item) => item.id));
        const base = `${block.id.slice(0, 48)}-copy`;
        let candidate = base;
        for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base.slice(0, 58)}-${suffix}`;
        const copy = structuredClone(block);
        copy.id = candidate;
        copy.frame.x = Math.min(100 - copy.frame.width, copy.frame.x + 3);
        copy.frame.y = Math.min(100 - copy.frame.height, copy.frame.y + 3);
        copy.z_index = Math.min(100, copy.z_index + 1);
        slide.composition.blocks.splice(index + 1, 0, copy);
        resultBlockId = candidate;
      }
    });
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: `project.slide_canvas_block_${parsed.data.action}d`,
      outcome: "succeeded",
      details: { project_id: projectId, slide_id: slideId, block_id: blockId, result_block_id: resultBlockId, version: project.version },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true, project_id: projectId, slide_id: slideId, block_id: blockId, result_block_id: resultBlockId, action: parsed.data.action, version: project.version, updated_at: project.updated_at, error: null, request_id: crypto.randomUUID() });
  } catch (error) {
    return projectMutationErrorResponse(error, "表示パーツを操作できませんでした。");
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
    LOG_ENTRY_NOT_FOUND: "研究ログが見つかりません。",
    NARRATION_SEGMENT_EXISTS: "このSTEPにはすでに読み上げ区間があります。",
    INVALID_NARRATION_STEP: "表示段階の範囲内からSTEPを選んでください。",
    VOICE_PROFILE_NOT_FOUND: "VOICEVOX profileが見つかりません。",
    COMPONENT_NOT_FOUND: "componentが見つかりません。",
    COMPONENT_HAS_CHILDREN: "子パーツを先に削除または別の親へ移動してください。",
    BLOCK_NOT_FOUND: "表示パーツが見つかりません。",
    INVALID_COMPOSITION_MODE: "このスライドの構成形式では操作できません。",
    INVALID_FIELDS: "入力内容を確認してください。",
    LAST_SLIDE_REQUIRED: "最後の1枚は削除できません。先に別のスライドを複製または追加してください。",
    PROJECT_TOO_LARGE: "研究データが512 KiBの保存上限を超えます。文章や不要なスライドを減らしてから保存してください。",
    PROJECT_VERSION_CONFLICT: "別の場所で更新されました。画面を読み込み直してください。"
  };
  const status =
    code === "PROJECT_NOT_FOUND" ||
    code === "SLIDE_NOT_FOUND" ||
    code === "TEMPLATE_NOT_FOUND" ||
    code === "NARRATION_NOT_FOUND" ||
    code === "NARRATION_SEGMENT_NOT_FOUND" ||
    code === "LOG_ENTRY_NOT_FOUND" ||
    code === "VOICE_PROFILE_NOT_FOUND" ||
    code === "COMPONENT_NOT_FOUND" ||
    code === "BLOCK_NOT_FOUND"
      ? 404
      : code === "PROJECT_VERSION_CONFLICT" ||
          code === "TEMPLATE_EXISTS" ||
          code === "DECK_REQUIRED" ||
          code === "INVALID_COMPOSITION_MODE" ||
          code === "COMPONENT_HAS_CHILDREN" ||
          code === "NARRATION_SEGMENT_EXISTS" ||
          code === "LAST_SLIDE_REQUIRED"
        ? 409
        : code === "INVALID_FIELDS" || code === "INVALID_NARRATION_STEP" || code === "PROJECT_TOO_LARGE"
          ? 422
          : 500;
  const details = error instanceof ProjectRepositoryError ? error.size : undefined;
  return jsonResponse(
    {
      ok: false,
      current_version: currentVersion,
      error: { code, message: messages[code] ?? fallbackMessage, details },
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
    const deck = project.document.deck!;
    const template = deck.templates?.find((item) => item.id === templateId);
    if (template === undefined) throw new Error("Updated presentation template could not be read.");
    const directSlideCount = deck.slides.filter((slide) => slide.template_id === templateId).length;
    const inheritedSlideCount = deck.default_template_id === templateId
      ? deck.slides.filter((slide) => slide.template_id === null || slide.template_id === undefined).length
      : 0;
    return jsonResponse({
      ok: true,
      project_id: projectId,
      template_id: templateId,
      template,
      default_template_id: deck.default_template_id ?? null,
      default_template: deck.templates?.find((item) => item.id === deck.default_template_id) ?? null,
      deck_layout: deck.layout,
      affected_slides: {
        direct: directSlideCount,
        inherited: inheritedSlideCount,
        total: directSlideCount + inheritedSlideCount
      },
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
        const missingCueProfile = parsed.data.voice_cues?.find(
          (cue) => cue.voice_profile_id !== null && cue.voice_profile_id !== undefined &&
            !document.deck?.voicevox?.profiles.some((profile) => profile.id === cue.voice_profile_id)
        );
        if (missingCueProfile !== undefined) {
          const error = new Error("The VOICEVOX cue profile does not exist.");
          Object.assign(error, { code: "VOICE_PROFILE_NOT_FOUND" });
          throw error;
        }
        const invalidatesAudio =
          segment.text !== parsed.data.text ||
          (segment.voice_profile_id ?? null) !== parsed.data.voice_profile_id ||
          JSON.stringify(segment.voice_tuning ?? null) !==
            JSON.stringify(parsed.data.voice_tuning) ||
          (parsed.data.voice_cues !== undefined &&
            JSON.stringify(segment.voice_cues ?? null) !== JSON.stringify(parsed.data.voice_cues));
        voiceGenerationRequired = invalidatesAudio || segment.audio_src === null;
        Object.assign(segment, {
          text: parsed.data.text,
          speaker: parsed.data.speaker,
          voice_profile_id: parsed.data.voice_profile_id,
          voice_tuning: parsed.data.voice_tuning,
          audio_src: invalidatesAudio ? null : segment.audio_src
        });
        if (parsed.data.voice_cues !== undefined) segment.voice_cues = parsed.data.voice_cues;
        if (parsed.data.pause_before_ms !== undefined) segment.pause_before_ms = parsed.data.pause_before_ms;
        if (parsed.data.pause_after_ms !== undefined) segment.pause_after_ms = parsed.data.pause_after_ms;
        narrationSegmentSchema.parse(segment);
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
    if (error instanceof ProjectRepositoryError && error.code === "PROJECT_TOO_LARGE") {
      return projectMutationErrorResponse(error, "読み上げ文を保存できませんでした。");
    }
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
  if (request.method !== "POST" && request.method !== "DELETE") {
    return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  if (request.method === "DELETE") {
    try {
      const status = await unpublishPresentation(env.DB, session.userId, projectId);
      await recordWebAudit(env.DB, {
        userId: session.userId,
        eventType: "presentation.unpublished",
        outcome: "succeeded",
        details: { project_id: projectId },
        createdAt: new Date().toISOString()
      });
      return jsonResponse({
        ok: true,
        publication: status,
        public_url: null,
        error: null,
        request_id: crypto.randomUUID()
      });
    } catch (error) {
      return publicationErrorResponse(error);
    }
  }
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
      eventType:
        status.events[0]?.action === "rollback"
          ? "presentation.rolled_back"
          : "presentation.published",
      outcome: "succeeded",
      details: {
        project_id: projectId,
        revision_id: parsed.data.revision_id,
        action: status.events[0]?.action ?? "publish",
        from_revision_id: status.events[0]?.from_revision_id ?? null
      },
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

async function handlePreviewReview(
  request: Request,
  env: Env,
  projectId: string,
  revisionId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const session = await requireWebSessionAndCsrf(request, env);
  if (session === null) return jsonResponse({ ok: false, error: { code: "AUTH_REQUIRED", message: "ログインし直してください。" }, request_id: crypto.randomUUID() }, 403);
  try {
    const status = await markPresentationPreviewReviewed(
      env.DB,
      session.userId,
      projectId,
      revisionId
    );
    await recordWebAudit(env.DB, {
      userId: session.userId,
      eventType: "presentation.preview_reviewed",
      outcome: "succeeded",
      details: { project_id: projectId, revision_id: revisionId },
      createdAt: new Date().toISOString()
    });
    return jsonResponse({
      ok: true,
      publication: status,
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
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/assets/dashboard.js" && (request.method === "GET" || request.method === "HEAD")) {
    const response = dashboardScriptResponse(url.searchParams.get("v") === DASHBOARD_ASSET_VERSION);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }
  if (path === "/assets/dashboard.css" && (request.method === "GET" || request.method === "HEAD")) {
    const response = dashboardStyleResponse(url.searchParams.get("v") === DASHBOARD_ASSET_VERSION);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
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
  if (path === "/guide" && (request.method === "GET" || request.method === "HEAD")) {
    const response = userGuidePage({
      broadcasterLogin: env.TWITCH_BROADCASTER_LOGIN,
      minFollowDays: Number(env.MIN_FOLLOW_DAYS)
    });
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
  const draftRevisionFrameMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/revisions/(\\d{1,9})/frame$`, "i")
  );
  if (draftRevisionFrameMatch?.[1] !== undefined && draftRevisionFrameMatch[2] !== undefined) {
    return handleDraftRevisionFrame(
      request,
      env,
      draftRevisionFrameMatch[1],
      Number(draftRevisionFrameMatch[2])
    );
  }
  const draftRevisionPageMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/revisions/(\\d{1,9})$`, "i")
  );
  if (draftRevisionPageMatch?.[1] !== undefined && draftRevisionPageMatch[2] !== undefined) {
    return handleDraftRevisionPage(
      request,
      env,
      draftRevisionPageMatch[1],
      Number(draftRevisionPageMatch[2])
    );
  }
  const slideReviewPageMatch = path.match(
    new RegExp(`^/dashboard/projects/${UUID_PATH}/review$`, "i")
  );
  if (slideReviewPageMatch?.[1] !== undefined) {
    return handleSlideReviewPage(request, env, slideReviewPageMatch[1]);
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
  const reviewCommentCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/review-comments$`, "i")
  );
  if (reviewCommentCreateMatch?.[1] !== undefined && reviewCommentCreateMatch[2] !== undefined) {
    return handleReviewCommentCreate(request, env, reviewCommentCreateMatch[1], reviewCommentCreateMatch[2]);
  }
  const reviewCommentMutationMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/review-comments/${UUID_PATH}$`, "i")
  );
  if (reviewCommentMutationMatch?.[1] !== undefined && reviewCommentMutationMatch[2] !== undefined) {
    return handleReviewCommentMutation(request, env, reviewCommentMutationMatch[1], reviewCommentMutationMatch[2]);
  }
  const reviewInstructionMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/review-instruction$`, "i")
  );
  if (reviewInstructionMatch?.[1] !== undefined) {
    return handleReviewInstruction(request, env, reviewInstructionMatch[1]);
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
  const voiceSampleMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/voice/sample$`, "i")
  );
  if (voiceSampleMatch?.[1] !== undefined) {
    return handleVoiceSample(request, env, voiceSampleMatch[1]);
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
  const projectListItemMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/list-items$`, "i")
  );
  if (projectListItemMatch?.[1] !== undefined) {
    return handleProjectListItemUpdate(request, env, projectListItemMatch[1]);
  }
  const researchLogMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/logs/${UUID_PATH}$`, "i")
  );
  if (researchLogMatch?.[1] !== undefined && researchLogMatch[2] !== undefined) {
    return handleResearchLogDelete(request, env, researchLogMatch[1], researchLogMatch[2]);
  }
  const qualityReportMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/quality-report$`, "i")
  );
  if (qualityReportMatch?.[1] !== undefined) {
    return handleRenderedQualityReportSave(request, env, qualityReportMatch[1]);
  }
  const draftRestoreMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/revisions/(\\d{1,9})/restore$`, "i")
  );
  if (draftRestoreMatch?.[1] !== undefined && draftRestoreMatch[2] !== undefined) {
    return handleDraftRevisionRestore(
      request,
      env,
      draftRestoreMatch[1],
      Number(draftRestoreMatch[2])
    );
  }
  const deckSettingsMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/presentation/settings$`, "i")
  );
  if (deckSettingsMatch?.[1] !== undefined) {
    return handleDeckSettingsUpdate(request, env, deckSettingsMatch[1]);
  }
  const slideCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides$`)
  );
  if (slideCreateMatch?.[1] !== undefined) {
    return handleSlideCreate(request, env, slideCreateMatch[1]);
  }
  const slideSplitMatch = path.match(
    new RegExp(
      `^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/split$`
    )
  );
  if (slideSplitMatch?.[1] !== undefined && slideSplitMatch[2] !== undefined) {
    return handleSlideSplit(
      request,
      env,
      slideSplitMatch[1],
      slideSplitMatch[2]
    );
  }
  const slideCompositionCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/composition$`)
  );
  if (slideCompositionCreateMatch?.[1] !== undefined && slideCompositionCreateMatch[2] !== undefined) {
    return handleSlideCompositionCreate(request, env, slideCompositionCreateMatch[1], slideCompositionCreateMatch[2]);
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
  const canvasBlockCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/blocks$`)
  );
  if (canvasBlockCreateMatch?.[1] !== undefined && canvasBlockCreateMatch[2] !== undefined) {
    return handleCanvasBlockCreate(
      request,
      env,
      canvasBlockCreateMatch[1],
      canvasBlockCreateMatch[2]
    );
  }
  const canvasBlockActionMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/blocks/([a-z0-9][a-z0-9-]{0,63})/actions$`)
  );
  if (
    canvasBlockActionMatch?.[1] !== undefined &&
    canvasBlockActionMatch[2] !== undefined &&
    canvasBlockActionMatch[3] !== undefined
  ) {
    return handleCanvasBlockAction(
      request,
      env,
      canvasBlockActionMatch[1],
      canvasBlockActionMatch[2],
      canvasBlockActionMatch[3]
    );
  }
  const canvasBlockMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/blocks/([a-z0-9][a-z0-9-]{0,63})$`)
  );
  if (
    canvasBlockMatch?.[1] !== undefined &&
    canvasBlockMatch[2] !== undefined &&
    canvasBlockMatch[3] !== undefined
  ) {
    return handleCanvasBlockUpdate(
      request,
      env,
      canvasBlockMatch[1],
      canvasBlockMatch[2],
      canvasBlockMatch[3]
    );
  }
  const sceneComponentItemActionMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/components/([a-z0-9][a-z0-9-]{0,63})/items$`)
  );
  if (
    sceneComponentItemActionMatch?.[1] !== undefined &&
    sceneComponentItemActionMatch[2] !== undefined &&
    sceneComponentItemActionMatch[3] !== undefined
  ) {
    return handleSceneComponentItemAction(
      request,
      env,
      sceneComponentItemActionMatch[1],
      sceneComponentItemActionMatch[2],
      sceneComponentItemActionMatch[3]
    );
  }
  const sceneComponentActionMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/components/([a-z0-9][a-z0-9-]{0,63})/actions$`)
  );
  if (
    sceneComponentActionMatch?.[1] !== undefined &&
    sceneComponentActionMatch[2] !== undefined &&
    sceneComponentActionMatch[3] !== undefined
  ) {
    return handleSceneComponentAction(
      request,
      env,
      sceneComponentActionMatch[1],
      sceneComponentActionMatch[2],
      sceneComponentActionMatch[3]
    );
  }
  const sceneComponentCreateMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/slides/([a-z0-9][a-z0-9-]{0,63})/components$`)
  );
  if (sceneComponentCreateMatch?.[1] !== undefined && sceneComponentCreateMatch[2] !== undefined) {
    return handleSceneComponentCreate(
      request,
      env,
      sceneComponentCreateMatch[1],
      sceneComponentCreateMatch[2]
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
  const projectPreviewReviewMatch = path.match(
    new RegExp(`^/api/projects/${UUID_PATH}/previews/${UUID_PATH}/review$`, "i")
  );
  if (
    projectPreviewReviewMatch?.[1] !== undefined &&
    projectPreviewReviewMatch[2] !== undefined
  ) {
    return handlePreviewReview(
      request,
      env,
      projectPreviewReviewMatch[1],
      projectPreviewReviewMatch[2]
    );
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
