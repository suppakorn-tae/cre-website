package mailer_test

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
)

func TestFakeRecordsOTP(t *testing.T) {
	f := &mailer.Fake{}
	if err := mailer.SendOTP(context.Background(), f, "a@example.com", "123456", 10); err != nil {
		t.Fatal(err)
	}
	sent := f.Sent()
	if len(sent) != 1 {
		t.Fatalf("sent = %d, want 1", len(sent))
	}
	if sent[0].To != "a@example.com" || !strings.Contains(sent[0].Subject, "123456") ||
		!strings.Contains(sent[0].Body, "รหัสยืนยันตัวตน") {
		t.Errorf("unexpected message: %+v", sent[0])
	}
}

func TestFakeError(t *testing.T) {
	boom := errors.New("boom")
	f := &mailer.Fake{Err: boom}
	if err := f.Send(context.Background(), mailer.Message{To: "a@example.com"}); !errors.Is(err, boom) {
		t.Fatalf("err = %v, want boom", err)
	}
	if len(f.Sent()) != 0 {
		t.Error("failed send must not be recorded")
	}
}

func TestNewSMTPValidates(t *testing.T) {
	if _, err := mailer.NewSMTP(mailer.Config{Port: 587, From: "a@example.com"}); err == nil {
		t.Error("want error for missing host")
	}
	if _, err := mailer.NewSMTP(mailer.Config{Host: "h", Port: 587, From: "not an address"}); err == nil {
		t.Error("want error for bad from")
	}
}

func TestSendRejectsBadInput(t *testing.T) {
	m, err := mailer.NewSMTP(mailer.Config{Host: "127.0.0.1", Port: 1, From: "a@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Send(context.Background(), mailer.Message{To: "nope", Subject: "x"}); !errors.Is(err, mailer.ErrSend) {
		t.Errorf("bad recipient: err = %v", err)
	}
	if err := m.Send(context.Background(), mailer.Message{To: "b@example.com", Subject: "x\r\nBcc: y@example.com"}); !errors.Is(err, mailer.ErrSend) {
		t.Errorf("header injection: err = %v", err)
	}
}

// A server that accepts the connection and never speaks must not hang Send.
func TestSendTimesOutOnSilentServer(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer func() { _ = c.Close() }() // hold open, never reply
		}
	}()

	addr := ln.Addr().(*net.TCPAddr)
	m, err := mailer.NewSMTP(mailer.Config{
		Host: "127.0.0.1", Port: addr.Port, From: "no-reply@example.com",
		Timeout: 300 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}

	start := time.Now()
	err = m.Send(context.Background(), mailer.Message{To: "u@example.com", Subject: "s", Body: "b"})
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("want error")
	}
	if !errors.Is(err, mailer.ErrSend) {
		t.Errorf("err = %v, want ErrSend", err)
	}
	if elapsed > 3*time.Second {
		t.Errorf("Send took %v, want about the 300ms time-out", elapsed)
	}
}

func TestSendHonoursContextDeadline(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go func() {
		c, err := ln.Accept()
		if err == nil {
			defer func() { _ = c.Close() }()
			time.Sleep(5 * time.Second)
		}
	}()

	m, err := mailer.NewSMTP(mailer.Config{
		Host: "127.0.0.1", Port: ln.Addr().(*net.TCPAddr).Port,
		From: "no-reply@example.com", Timeout: time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	if err := m.Send(ctx, mailer.Message{To: "u@example.com", Subject: "s", Body: "b"}); err == nil {
		t.Fatal("want error")
	}
	if time.Since(start) > 3*time.Second {
		t.Errorf("Send ignored the context deadline: %v", time.Since(start))
	}
}

func TestSendFailsFastWhenNothingListens(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	m, err := mailer.NewSMTP(mailer.Config{Host: "127.0.0.1", Port: port, From: "a@example.com", Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Send(context.Background(), mailer.Message{To: "u@example.com"}); !errors.Is(err, mailer.ErrSend) {
		t.Fatalf("err = %v, want ErrSend", err)
	}
}
