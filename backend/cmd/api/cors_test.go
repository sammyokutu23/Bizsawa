package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

// The Expo web build's sync client sends X-Device-Id and X-Business-ID; a
// browser preflight asking for them must be allowed or sync never leaves.
func TestCORSPreflightAllowsWebSyncHeaders(t *testing.T) {
	r := chi.NewRouter()
	r.Use(cors.Handler(corsOptions([]string{"http://localhost:8081"})))
	r.Post("/api/v1/sync/push", func(w http.ResponseWriter, _ *http.Request) {})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/sync/push", nil)
	req.Header.Set("Origin", "http://localhost:8081")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "authorization,content-type,x-business-id,x-device-id,x-idempotency-key")

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8081" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want http://localhost:8081", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatalf("expected Access-Control-Allow-Headers on preflight, got none")
	}
}
