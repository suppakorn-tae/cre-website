package mailer_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
)

type mailpit struct {
	smtpHost string
	smtpPort int
	apiURL   string
}

func startMailpit(t *testing.T) mailpit {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "axllent/mailpit:v1.21",
			ExposedPorts: []string{"1025/tcp", "8025/tcp"},
			WaitingFor:   wait.ForHTTP("/api/v1/info").WithPort("8025/tcp").WithStartupTimeout(2 * time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start mailpit: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(c) })

	host, err := c.Host(ctx)
	if err != nil {
		t.Fatal(err)
	}
	smtpPort, err := c.MappedPort(ctx, "1025/tcp")
	if err != nil {
		t.Fatal(err)
	}
	api, err := c.PortEndpoint(ctx, "8025/tcp", "http")
	if err != nil {
		t.Fatal(err)
	}
	return mailpit{smtpHost: host, smtpPort: int(smtpPort.Num()), apiURL: api}
}

func (m mailpit) get(t *testing.T, path string, out any) {
	t.Helper()
	resp, err := http.Get(m.apiURL + path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		t.Fatal(err)
	}
}

func TestSMTPOTPCapturedByMailpit(t *testing.T) {
	mp := startMailpit(t)

	m, err := mailer.NewSMTP(mailer.Config{
		Host: mp.smtpHost, Port: mp.smtpPort, From: "no-reply@localhost",
		Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := mailer.SendOTP(context.Background(), m, "somchai@example.com", "482915", 10); err != nil {
		t.Fatalf("send: %v", err)
	}

	var list struct {
		Messages []struct {
			ID      string
			Subject string
			To      []struct{ Address string }
		}
	}
	var id string
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		mp.get(t, "/api/v1/messages", &list)
		if len(list.Messages) > 0 {
			id = list.Messages[0].ID
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if id == "" {
		t.Fatal("mailpit captured no message")
	}
	msg := list.Messages[0]
	if want := "รหัสยืนยันตัวตน (OTP) ของคุณคือ 482915"; msg.Subject != want {
		t.Errorf("subject = %q, want %q", msg.Subject, want)
	}
	if len(msg.To) != 1 || msg.To[0].Address != "somchai@example.com" {
		t.Errorf("to = %+v", msg.To)
	}

	var full struct{ Text string }
	mp.get(t, fmt.Sprintf("/api/v1/message/%s", id), &full)
	for _, want := range []string{"482915", "10 นาที", "เรียนผู้ใช้งาน"} {
		if !strings.Contains(full.Text, want) {
			t.Errorf("body missing %q:\n%s", want, full.Text)
		}
	}
}
