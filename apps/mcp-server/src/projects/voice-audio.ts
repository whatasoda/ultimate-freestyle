import type { ProjectDocument } from "./schema";

export function invalidateInheritedVoiceAudio(
  document: ProjectDocument
): void {
  for (const slide of document.deck?.slides ?? []) {
    for (const segment of slide.narration?.segments ?? []) {
      if (segment.voice_profile_id === null || segment.voice_profile_id === undefined) {
        segment.audio_src = null;
      }
    }
  }
}

export function invalidateVoiceProfileAudio(
  document: ProjectDocument,
  profileId: string
): void {
  const defaultProfileId = document.deck?.voicevox?.default_profile_id;
  for (const slide of document.deck?.slides ?? []) {
    for (const segment of slide.narration?.segments ?? []) {
      const inheritsProfile =
        (segment.voice_profile_id === null || segment.voice_profile_id === undefined) &&
        defaultProfileId === profileId;
      if (segment.voice_profile_id === profileId || inheritsProfile) {
        segment.audio_src = null;
      }
    }
  }
}
