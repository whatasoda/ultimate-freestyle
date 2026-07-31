export type VoiceGenerationMessage = {
  job_id: string;
  segment_id: string;
  fingerprint: string;
};

export function isVoiceGenerationMessage(
  value: unknown
): value is VoiceGenerationMessage {
  if (value === null || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.job_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(message.job_id) &&
    typeof message.segment_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(message.segment_id) &&
    typeof message.fingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(message.fingerprint)
  );
}
