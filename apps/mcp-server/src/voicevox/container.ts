import { Container } from "@cloudflare/containers";

export class VoicevoxContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = false;
  pingEndpoint = "/health";

  override onStart(): void {
    console.log(JSON.stringify({ message: "VOICEVOX Container started" }));
  }

  override onStop(): void {
    console.log(JSON.stringify({ message: "VOICEVOX Container stopped" }));
  }

  override onError(error: unknown): void {
    console.error(
      JSON.stringify({
        message: "VOICEVOX Container failed",
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}
