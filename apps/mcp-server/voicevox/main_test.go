package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeEngine struct {
	versionValue string
	speakerData  []byte
	wav          []byte
	lastText     string
	lastStyleID  int
	lastTuning   voiceTuning
	err          error
}

func (f *fakeEngine) version(context.Context) (string, error) {
	return f.versionValue, f.err
}

func (f *fakeEngine) speakers(context.Context) ([]byte, error) {
	return f.speakerData, f.err
}

func (f *fakeEngine) synthesize(_ context.Context, text string, styleID int, tuning voiceTuning) ([]byte, error) {
	f.lastText = text
	f.lastStyleID = styleID
	f.lastTuning = tuning
	return f.wav, f.err
}

func validRequest() string {
	return `{
  "text": "最自由研究です。",
  "style_id": 3,
  "tuning": {
    "speedScale": 1.05,
    "pitchScale": 0,
    "intonationScale": 1.1,
    "volumeScale": 1,
    "pauseLengthScale": 1,
    "prePhonemeLength": 0.1,
    "postPhonemeLength": 0.1
  }
}`
}

func TestSynthesizeAppliesValidatedInput(t *testing.T) {
	engine := &fakeEngine{versionValue: "0.25.1", speakerData: []byte(`[]`), wav: []byte("wav")}
	api := newHandler(engine, func(_ context.Context, wav []byte) ([]byte, error) {
		if string(wav) != "wav" {
			t.Fatalf("unexpected WAV: %q", wav)
		}
		return []byte("mp3"), nil
	})
	request := httptest.NewRequest(http.MethodPost, "/synthesize", strings.NewReader(validRequest()))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	api.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Content-Type") != "audio/mpeg" || response.Body.String() != "mp3" {
		t.Fatalf("unexpected response: %s %q", response.Header().Get("Content-Type"), response.Body.String())
	}
	if engine.lastText != "最自由研究です。" || engine.lastStyleID != 3 {
		t.Fatalf("input was not forwarded: %#v", engine)
	}
	if engine.lastTuning.SpeedScale != 1.05 || engine.lastTuning.IntonationScale != 1.1 {
		t.Fatalf("tuning was not forwarded: %#v", engine.lastTuning)
	}
}

func TestSynthesizeRejectsUnsafeInput(t *testing.T) {
	engine := &fakeEngine{wav: []byte("wav")}
	api := newHandler(engine, func(context.Context, []byte) ([]byte, error) { return []byte("mp3"), nil })
	tests := []struct {
		name string
		body string
		code string
	}{
		{"unknown field", strings.Replace(validRequest(), `"text":`, `"unknown": true, "text":`, 1), "INVALID_JSON"},
		{"too long", strings.Replace(validRequest(), "最自由研究です。", strings.Repeat("あ", 501), 1), "TEXT_TOO_LONG"},
		{"invalid tuning", strings.Replace(validRequest(), `"speedScale": 1.05`, `"speedScale": 2.01`, 1), "TUNING_INVALID"},
		{"missing tuning", strings.Replace(validRequest(), `"pitchScale": 0,`, ``, 1), "TUNING_REQUIRED"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/synthesize", strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			if response.Code < 400 {
				t.Fatalf("status = %d", response.Code)
			}
			if !strings.Contains(response.Body.String(), test.code) {
				t.Fatalf("body = %s", response.Body.String())
			}
		})
	}
}

func TestEngineClientAppliesTuningAndReadsWAV(t *testing.T) {
	var synthesisQuery map[string]any
	engine := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/audio_query":
			if request.Method != http.MethodPost || request.URL.Query().Get("speaker") != "3" || request.URL.Query().Get("text") != "本文" {
				t.Fatalf("unexpected audio_query request: %s", request.URL.String())
			}
			response.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(response, `{"speedScale":1,"kana":"テスト"}`)
		case "/synthesis":
			if err := json.NewDecoder(request.Body).Decode(&synthesisQuery); err != nil {
				t.Fatal(err)
			}
			response.Header().Set("Content-Type", "audio/wav")
			_, _ = response.Write([]byte("wav-data"))
		default:
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer engine.Close()
	client := &engineClient{baseURL: engine.URL, client: engine.Client()}
	tuning := voiceTuning{1.05, 0.02, 1.1, 0.9, 1.2, 0.1, 0.2}

	wav, err := client.synthesize(context.Background(), "本文", 3, tuning)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(wav, []byte("wav-data")) {
		t.Fatalf("wav = %q", wav)
	}
	for key, expected := range map[string]float64{
		"speedScale": 1.05, "pitchScale": 0.02, "intonationScale": 1.1,
		"volumeScale": 0.9, "pauseLengthScale": 1.2,
		"prePhonemeLength": 0.1, "postPhonemeLength": 0.2,
	} {
		if synthesisQuery[key] != expected {
			t.Fatalf("%s = %#v", key, synthesisQuery[key])
		}
	}
}

func TestHealthAndSpeakers(t *testing.T) {
	engine := &fakeEngine{versionValue: "0.25.1", speakerData: []byte(`[{"name":"ずんだもん"}]`)}
	api := newHandler(engine, nil)
	for _, path := range []string{"/health", "/speakers"} {
		response := httptest.NewRecorder()
		api.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d, body = %s", path, response.Code, response.Body.String())
		}
	}
}
