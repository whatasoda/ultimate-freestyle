package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	maxRequestBytes    = 16 * 1024
	maxTextRunes       = 500
	maxAudioQueryBytes = 2 * 1024 * 1024
	maxSpeakersBytes   = 2 * 1024 * 1024
	maxWAVBytes        = 32 * 1024 * 1024
	maxMP3Bytes        = 8 * 1024 * 1024
	requestTimeout     = 3 * time.Minute
)

type voiceTuning struct {
	SpeedScale        float64
	PitchScale        float64
	IntonationScale   float64
	VolumeScale       float64
	PauseLengthScale  float64
	PrePhonemeLength  float64
	PostPhonemeLength float64
}

type voiceTuningInput struct {
	SpeedScale        *float64 `json:"speedScale"`
	PitchScale        *float64 `json:"pitchScale"`
	IntonationScale   *float64 `json:"intonationScale"`
	VolumeScale       *float64 `json:"volumeScale"`
	PauseLengthScale  *float64 `json:"pauseLengthScale"`
	PrePhonemeLength  *float64 `json:"prePhonemeLength"`
	PostPhonemeLength *float64 `json:"postPhonemeLength"`
}

type synthesizeRequest struct {
	Text    string            `json:"text"`
	StyleID *int              `json:"style_id"`
	Tuning  *voiceTuningInput `json:"tuning"`
}

type engineAPI interface {
	version(context.Context) (string, error)
	speakers(context.Context) ([]byte, error)
	synthesize(context.Context, string, int, voiceTuning) ([]byte, error)
}

type mp3Encoder func(context.Context, []byte) ([]byte, error)

type handler struct {
	engine engineAPI
	encode mp3Encoder
	slot   chan struct{}
}

type engineClient struct {
	baseURL string
	client  *http.Client
}

type upstreamError struct {
	operation string
	status    int
}

func (e upstreamError) Error() string {
	return fmt.Sprintf("VOICEVOX %s failed with status %d", e.operation, e.status)
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	enginePath := environment("VOICEVOX_ENGINE_PATH", "/opt/voicevox_engine/run")
	ffmpegPath := environment("FFMPEG_PATH", "ffmpeg")
	port := environment("PORT", "8080")
	if _, err := exec.LookPath(ffmpegPath); err != nil {
		return fmt.Errorf("ffmpeg is unavailable: %w", err)
	}

	engineCommand := exec.Command(
		enginePath,
		"--host", "127.0.0.1",
		"--port", "50021",
		"--disable_mutable_api",
	)
	engineCommand.Stdout = io.Discard
	engineCommand.Stderr = io.Discard
	if err := engineCommand.Start(); err != nil {
		return fmt.Errorf("VOICEVOX ENGINE could not start: %w", err)
	}
	engineDone := make(chan error, 1)
	go func() { engineDone <- engineCommand.Wait() }()

	client := &engineClient{
		baseURL: "http://127.0.0.1:50021",
		client:  &http.Client{Timeout: requestTimeout},
	}
	api := newHandler(client, ffmpegEncoder(ffmpegPath))
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           api,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      requestTimeout + 15*time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    8 * 1024,
	}

	signalContext, stopSignals := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT,
		syscall.SIGTERM,
	)
	defer stopSignals()
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.ListenAndServe() }()

	var result error
	engineExited := false
	select {
	case <-signalContext.Done():
	case err := <-engineDone:
		engineExited = true
		result = fmt.Errorf("VOICEVOX ENGINE stopped unexpectedly: %w", err)
	case err := <-serverDone:
		if !errors.Is(err, http.ErrServerClosed) {
			result = fmt.Errorf("wrapper server stopped: %w", err)
		}
	}

	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	_ = server.Shutdown(shutdownContext)
	if !engineExited {
		_ = engineCommand.Process.Signal(syscall.SIGTERM)
		select {
		case <-engineDone:
		case <-time.After(10 * time.Second):
			_ = engineCommand.Process.Kill()
			<-engineDone
		}
	}
	return result
}

func environment(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func newHandler(engine engineAPI, encode mp3Encoder) http.Handler {
	return &handler{engine: engine, encode: encode, slot: make(chan struct{}, 1)}
}

func (h *handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	switch request.URL.Path {
	case "/health":
		h.health(response, request)
	case "/speakers":
		h.listSpeakers(response, request)
	case "/synthesize":
		h.synthesize(response, request)
	default:
		writeError(response, http.StatusNotFound, "NOT_FOUND", "The endpoint does not exist.")
	}
}

func (h *handler) health(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(response, http.MethodGet)
		return
	}
	context, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()
	version, err := h.engine.version(context)
	if err != nil {
		writeJSON(response, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{
		"status":         "ok",
		"engine_version": version,
	})
}

func (h *handler) listSpeakers(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(response, http.MethodGet)
		return
	}
	context, cancel := context.WithTimeout(request.Context(), 15*time.Second)
	defer cancel()
	speakers, err := h.engine.speakers(context)
	if err != nil {
		writeError(response, http.StatusBadGateway, "ENGINE_UNAVAILABLE", "VOICEVOX ENGINE is unavailable.")
		return
	}
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(http.StatusOK)
	_, _ = response.Write(speakers)
}

func (h *handler) synthesize(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(response, http.MethodPost)
		return
	}
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(response, http.StatusUnsupportedMediaType, "CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.")
		return
	}
	var input synthesizeRequest
	request.Body = http.MaxBytesReader(response, request.Body, maxRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(response, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The request body is too large.")
			return
		}
		writeError(response, http.StatusBadRequest, "INVALID_JSON", "The request body is invalid.")
		return
	}
	if err := ensureJSONEnd(decoder); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_JSON", "The request body must contain one JSON value.")
		return
	}
	tuning, code, message := validateSynthesis(input)
	if code != "" {
		writeError(response, http.StatusUnprocessableEntity, code, message)
		return
	}
	select {
	case h.slot <- struct{}{}:
		defer func() { <-h.slot }()
	default:
		writeError(response, http.StatusTooManyRequests, "SYNTHESIS_BUSY", "Another synthesis is in progress.")
		return
	}

	context, cancel := context.WithTimeout(request.Context(), requestTimeout)
	defer cancel()
	wav, err := h.engine.synthesize(context, input.Text, *input.StyleID, tuning)
	if err != nil {
		log.Printf("VOICEVOX synthesis failed: %v", err)
		writeError(response, http.StatusBadGateway, "SYNTHESIS_FAILED", "VOICEVOX could not synthesize the narration.")
		return
	}
	mp3, err := h.encode(context, wav)
	if err != nil {
		log.Printf("MP3 encoding failed: %v", err)
		writeError(response, http.StatusInternalServerError, "ENCODING_FAILED", "The synthesized audio could not be encoded.")
		return
	}
	response.Header().Set("Content-Type", "audio/mpeg")
	response.Header().Set("Content-Length", strconv.Itoa(len(mp3)))
	response.WriteHeader(http.StatusOK)
	_, _ = response.Write(mp3)
}

func ensureJSONEnd(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("additional JSON value")
		}
		return err
	}
	return nil
}

func validateSynthesis(input synthesizeRequest) (voiceTuning, string, string) {
	if strings.TrimSpace(input.Text) == "" || !utf8.ValidString(input.Text) {
		return voiceTuning{}, "TEXT_REQUIRED", "text must be valid, non-empty UTF-8."
	}
	if utf8.RuneCountInString(input.Text) > maxTextRunes {
		return voiceTuning{}, "TEXT_TOO_LONG", "text must not exceed 500 characters."
	}
	if input.StyleID == nil || *input.StyleID < 0 || *input.StyleID > 999999 {
		return voiceTuning{}, "STYLE_ID_INVALID", "style_id must be an integer from 0 to 999999."
	}
	tuning, complete := resolveTuning(input.Tuning)
	if !complete {
		return voiceTuning{}, "TUNING_REQUIRED", "All effective tuning values are required."
	}
	values := []struct {
		name    string
		value   float64
		minimum float64
		maximum float64
	}{
		{"speedScale", tuning.SpeedScale, 0.5, 2},
		{"pitchScale", tuning.PitchScale, -0.15, 0.15},
		{"intonationScale", tuning.IntonationScale, 0, 2},
		{"volumeScale", tuning.VolumeScale, 0, 2},
		{"pauseLengthScale", tuning.PauseLengthScale, 0, 2},
		{"prePhonemeLength", tuning.PrePhonemeLength, 0, 1.5},
		{"postPhonemeLength", tuning.PostPhonemeLength, 0, 1.5},
	}
	for _, candidate := range values {
		if math.IsNaN(candidate.value) || math.IsInf(candidate.value, 0) ||
			candidate.value < candidate.minimum || candidate.value > candidate.maximum ||
			math.Abs(candidate.value*100-math.Round(candidate.value*100)) > 1e-8 {
			return voiceTuning{}, "TUNING_INVALID", candidate.name + " is outside its allowed range or 0.01 step."
		}
	}
	return tuning, "", ""
}

func resolveTuning(input *voiceTuningInput) (voiceTuning, bool) {
	if input == nil || input.SpeedScale == nil || input.PitchScale == nil ||
		input.IntonationScale == nil || input.VolumeScale == nil ||
		input.PauseLengthScale == nil || input.PrePhonemeLength == nil ||
		input.PostPhonemeLength == nil {
		return voiceTuning{}, false
	}
	return voiceTuning{
		SpeedScale:        *input.SpeedScale,
		PitchScale:        *input.PitchScale,
		IntonationScale:   *input.IntonationScale,
		VolumeScale:       *input.VolumeScale,
		PauseLengthScale:  *input.PauseLengthScale,
		PrePhonemeLength:  *input.PrePhonemeLength,
		PostPhonemeLength: *input.PostPhonemeLength,
	}, true
}

func (c *engineClient) version(context context.Context) (string, error) {
	response, err := c.request(context, http.MethodGet, "/version", nil)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", upstreamError{operation: "version", status: response.StatusCode}
	}
	data, err := readLimited(response.Body, 1024)
	if err != nil {
		return "", err
	}
	var version string
	if err := json.Unmarshal(data, &version); err != nil || version == "" {
		return "", errors.New("VOICEVOX version response is invalid")
	}
	return version, nil
}

func (c *engineClient) speakers(context context.Context) ([]byte, error) {
	response, err := c.request(context, http.MethodGet, "/speakers", nil)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, upstreamError{operation: "speakers", status: response.StatusCode}
	}
	data, err := readLimited(response.Body, maxSpeakersBytes)
	if err != nil {
		return nil, err
	}
	if !json.Valid(data) {
		return nil, errors.New("VOICEVOX speakers response is invalid")
	}
	return data, nil
}

func (c *engineClient) synthesize(context context.Context, text string, styleID int, tuning voiceTuning) ([]byte, error) {
	queryPath := "/audio_query?" + url.Values{
		"speaker": {strconv.Itoa(styleID)},
		"text":    {text},
	}.Encode()
	queryResponse, err := c.request(context, http.MethodPost, queryPath, nil)
	if err != nil {
		return nil, err
	}
	defer queryResponse.Body.Close()
	if queryResponse.StatusCode != http.StatusOK {
		return nil, upstreamError{operation: "audio_query", status: queryResponse.StatusCode}
	}
	queryData, err := readLimited(queryResponse.Body, maxAudioQueryBytes)
	if err != nil {
		return nil, err
	}
	var query map[string]any
	if err := json.Unmarshal(queryData, &query); err != nil {
		return nil, errors.New("VOICEVOX audio query is invalid")
	}
	query["speedScale"] = tuning.SpeedScale
	query["pitchScale"] = tuning.PitchScale
	query["intonationScale"] = tuning.IntonationScale
	query["volumeScale"] = tuning.VolumeScale
	query["pauseLengthScale"] = tuning.PauseLengthScale
	query["prePhonemeLength"] = tuning.PrePhonemeLength
	query["postPhonemeLength"] = tuning.PostPhonemeLength
	body, err := json.Marshal(query)
	if err != nil {
		return nil, err
	}
	synthesisPath := "/synthesis?" + url.Values{"speaker": {strconv.Itoa(styleID)}}.Encode()
	synthesisResponse, err := c.request(context, http.MethodPost, synthesisPath, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer synthesisResponse.Body.Close()
	if synthesisResponse.StatusCode != http.StatusOK {
		return nil, upstreamError{operation: "synthesis", status: synthesisResponse.StatusCode}
	}
	contentType, _, err := mime.ParseMediaType(synthesisResponse.Header.Get("Content-Type"))
	if err != nil || (contentType != "audio/wav" && contentType != "audio/x-wav" && contentType != "audio/wave") {
		return nil, errors.New("VOICEVOX synthesis response is not WAV")
	}
	return readLimited(synthesisResponse.Body, maxWAVBytes)
}

func (c *engineClient) request(context context.Context, method, path string, body io.Reader) (*http.Response, error) {
	request, err := http.NewRequestWithContext(context, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return c.client.Do(request)
}

func readLimited(reader io.Reader, maximum int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, errors.New("upstream response exceeded its size limit")
	}
	return data, nil
}

func ffmpegEncoder(path string) mp3Encoder {
	return func(context context.Context, wav []byte) ([]byte, error) {
		command := exec.CommandContext(
			context,
			path,
			"-hide_banner", "-loglevel", "error", "-nostdin",
			"-i", "pipe:0", "-vn", "-ac", "1", "-ar", "24000",
			"-codec:a", "libmp3lame", "-b:a", "64k",
			"-map_metadata", "-1", "-f", "mp3", "pipe:1",
		)
		command.Stdin = bytes.NewReader(wav)
		var output bytes.Buffer
		var errorOutput bytes.Buffer
		command.Stdout = &output
		command.Stderr = &errorOutput
		if err := command.Run(); err != nil {
			return nil, fmt.Errorf("ffmpeg failed: %w: %s", err, strings.TrimSpace(errorOutput.String()))
		}
		if output.Len() == 0 || output.Len() > maxMP3Bytes {
			return nil, errors.New("encoded MP3 is empty or exceeds its size limit")
		}
		return output.Bytes(), nil
	}
}

func methodNotAllowed(response http.ResponseWriter, allowed string) {
	response.Header().Set("Allow", allowed)
	writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "The HTTP method is not allowed.")
}

func writeError(response http.ResponseWriter, status int, code, message string) {
	writeJSON(response, status, map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		http.Error(response, "internal error", http.StatusInternalServerError)
		return
	}
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_, _ = response.Write(append(data, '\n'))
}
