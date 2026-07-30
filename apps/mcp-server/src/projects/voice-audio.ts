import type { ProjectDocument } from "./schema";

export function invalidateInheritedVoiceAudio(
  document: ProjectDocument
): void {
  for (const slide of document.deck?.slides ?? []) {
    for (const segment of slide.narration?.segments ?? []) {
      const segmentInherits = segment.voice_profile_id === null || segment.voice_profile_id === undefined;
      if (segmentInherits) {
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
      const cueUsesProfile = segment.voice_cues?.some((cue) => {
        if (cue.voice_profile_id === profileId) return true;
        return (cue.voice_profile_id === null || cue.voice_profile_id === undefined) &&
          (segment.voice_profile_id === profileId || inheritsProfile);
      }) ?? false;
      if (segment.voice_profile_id === profileId || inheritsProfile || cueUsesProfile) {
        segment.audio_src = null;
      }
    }
  }
}
